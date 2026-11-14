"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { authenticate, createAccount, currentUser, endSession, requireUser, startSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import * as repo from "@/lib/db/repo";
import { interpretRequest, type ParseResult } from "@/lib/agents/demand-intelligence";
import { RunRecorder } from "@/lib/services/coordination";
import * as pools from "@/lib/services/pools";
import { planOnchain, recordOnchain, type OnchainPlan } from "@/lib/services/onchain";
import { resetDemo } from "@/lib/demo/seed";
import { todayISO } from "@/lib/util";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof pools.UserFacingError || e instanceof repo.AuthorizationError) return { ok: false, error: e.message };
  if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
  if (e instanceof Error && /^(Pool is|Pool not found|Contract not configured)/.test(e.message)) return { ok: false, error: e.message };
  console.error("[commons] action failed:", e instanceof Error ? e.message : "unknown error");
  return { ok: false, error: "Something went wrong. Please try again." };
}

// ── Auth ─────────────────────────────────────────────────────────────────
export async function signInDemoAction(formData: FormData) {
  const id = String(formData.get("persona") ?? "");
  const user = repo.getUser(getDb(), id);
  if (!user || !user.is_demo) throw new Error("Unknown demo persona");
  await startSession(user.id);
  redirect(String(formData.get("next") || "/app"));
}

const SignUp = z.object({
  email: z.email().max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  fullName: z.string().trim().min(2).max(100),
  businessName: z.string().trim().max(100).optional(),
  location: z.string().trim().max(100).optional(),
});

export async function signUpAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const input = SignUp.parse(Object.fromEntries(formData));
    const id = createAccount(input);
    await startSession(id);
  } catch (e) {
    if (e instanceof Error && e.message.includes("already exists")) return { ok: false, error: e.message };
    return fail(e);
  }
  redirect("/app");
}

export async function signInAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const id = authenticate(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if (!id) return { ok: false, error: "Email or password is incorrect." };
  await startSession(id);
  redirect("/app");
}

export async function signOutAction() {
  await endSession();
  redirect("/");
}

// ── Demand ───────────────────────────────────────────────────────────────
export async function interpretAction(text: string): Promise<ActionResult<ParseResult>> {
  try {
    const user = await requireUser();
    const clean = z.string().trim().min(5).max(1000).parse(text);
    const msg = interpretRequest(clean, todayISO());
    new RunRecorder(getDb(), null, user.id).record(msg);
    return { ok: true, data: msg.output };
  } catch (e) {
    return fail(e);
  }
}

export async function createIntentAction(input: pools.IntentInputT): Promise<ActionResult<ReturnType<typeof pools.matchIntent> & { intentId: string }>> {
  try {
    const user = await requireUser();
    const db = getDb();
    const { id } = pools.createIntent(db, user.id, input);
    const match = pools.matchIntent(db, user.id, id);
    revalidatePath("/app", "layout");
    return { ok: true, data: { ...match, intentId: id } };
  } catch (e) {
    return fail(e);
  }
}

export async function joinPoolAction(poolId: string, intentId: string): Promise<ActionResult<{ poolId: string }>> {
  try {
    const user = await requireUser();
    pools.joinPool(getDb(), user.id, poolId, intentId);
    revalidatePath("/app", "layout");
    return { ok: true, data: { poolId } };
  } catch (e) {
    return fail(e);
  }
}

export async function startPoolAction(intentId: string): Promise<ActionResult<{ poolId: string }>> {
  try {
    const user = await requireUser();
    const poolId = pools.startPool(getDb(), user.id, intentId);
    revalidatePath("/app", "layout");
    return { ok: true, data: { poolId } };
  } catch (e) {
    return fail(e);
  }
}

// ── Negotiation & approvals ──────────────────────────────────────────────
export async function negotiateAction(poolId: string): Promise<ActionResult<{ approved: boolean }>> {
  try {
    const user = await requireUser();
    const r = pools.negotiate(getDb(), user.id, poolId);
    revalidatePath("/app", "layout");
    return { ok: true, data: { approved: !!r.approvedProposalId } };
  } catch (e) {
    return fail(e);
  }
}

export async function decideAction(proposalId: string, decision: pools.Decision, reviewedHash: string, note?: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    z.enum(["approved", "rejected", "revision_requested"]).parse(decision);
    pools.decide(getDb(), user.id, proposalId, decision, reviewedHash, note);
    revalidatePath("/app", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function withdrawAction(poolId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    pools.withdraw(getDb(), user.id, poolId);
    revalidatePath("/app", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

// ── Wallet & NEAR ────────────────────────────────────────────────────────
export async function linkWalletAction(accountId: string | null): Promise<ActionResult> {
  try {
    const user = await requireUser();
    pools.updateWallet(getDb(), user.id, accountId);
    revalidatePath("/app", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

export async function planOnchainAction(poolId: string): Promise<ActionResult<OnchainPlan>> {
  try {
    const user = await requireUser();
    return { ok: true, data: planOnchain(getDb(), user.id, poolId) };
  } catch (e) {
    return fail(e);
  }
}

export async function recordOnchainAction(poolId: string, hashes: string[]): Promise<ActionResult<Awaited<ReturnType<typeof recordOnchain>>>> {
  try {
    const user = await requireUser();
    const res = await recordOnchain(getDb(), user.id, poolId, z.array(z.string().max(64)).max(10).parse(hashes));
    revalidatePath("/app", "layout");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

// ── Demo ─────────────────────────────────────────────────────────────────
export async function resetDemoAction(): Promise<ActionResult> {
  try {
    const user = await currentUser();
    if (!user) return { ok: false, error: "Sign in first." };
    resetDemo(getDb());
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}
