import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import * as repo from "./db/repo";
import { newId } from "./util";

const COOKIE = "commons_session";
const SESSION_DAYS = 7;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored?.startsWith("scrypt:")) return false;
  const [, saltHex, hashHex] = stored.split(":");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return timingSafeEqual(actual, Buffer.from(hashHex, "hex"));
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  getDb().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha(token), userId, expires.toISOString());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<repo.UserRow | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const s = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?").get(sha(token)) as { user_id: string; expires_at: string } | undefined;
  if (!s || s.expires_at < new Date().toISOString()) return null;
  return repo.getUser(db, s.user_id) ?? null;
}

export async function requireUser(): Promise<repo.UserRow> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export function createAccount(input: { email: string; password: string; fullName: string; businessName?: string; location?: string }) {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) throw new Error("An account with that email already exists.");
  const id = newId("usr");
  db.prepare("INSERT INTO users (id, email, password_hash, full_name, business_name, location) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, email, hashPassword(input.password), input.fullName.trim(), input.businessName?.trim() || null, input.location?.trim() || null);
  repo.audit(db, id, "account_created", "user", id);
  return id;
}

export function authenticate(email: string, password: string): string | null {
  const row = getDb().prepare("SELECT id, password_hash FROM users WHERE email = ? AND is_demo = 0").get(email.trim().toLowerCase()) as { id: string; password_hash: string | null } | undefined;
  return row && verifyPassword(password, row.password_hash) ? row.id : null;
}
