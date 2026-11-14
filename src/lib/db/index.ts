import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA } from "./schema";
import { seedDemo } from "../demo/seed";

type G = typeof globalThis & { __commonsDb?: DatabaseSync };

function dbPath(): string {
  if (process.env.COMMONS_DB_PATH) return process.env.COMMONS_DB_PATH;
  // Serverless platforms only allow writes under /tmp.
  if (process.env.VERCEL) return "/tmp/commons.db";
  return path.join(process.cwd(), "data", "commons.db");
}

export function openDb(file: string): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n === 0) seedDemo(db);
  return db;
}

export function getDb(): DatabaseSync {
  const g = globalThis as G;
  if (!g.__commonsDb) g.__commonsDb = openDb(dbPath());
  return g.__commonsDb;
}

/** Test hook: point the app at a specific database instance. */
export function setDbForTests(db: DatabaseSync) {
  (globalThis as G).__commonsDb = db;
}
