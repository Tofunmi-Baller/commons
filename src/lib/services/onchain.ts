/**
 * Bridges the off-chain negotiation to the NEAR contract. The server decides the
 * exact arguments for each step (so the browser cannot alter terms), the user's
 * wallet signs, and the server then verifies the resulting hash on-chain before
 * recording it. No private keys are ever requested or stored.
 */
import type { DatabaseSync } from "node:sqlite";
import * as repo from "../db/repo";
import { UserFacingError } from "./pools";
import { RunRecorder } from "./coordination";
import { message } from "../agents/types";
import { NEAR_CONTRACT_ID } from "../near/config";
import { verifyTransaction, type VerifiedTx } from "../near/rpc";
import { newId, tx } from "../util";

export interface ContractCall {
  label: string;
  methodName: string;
  args: Record<string, unknown>;
}

export interface OnchainPlan {
  configured: boolean;
  step: "create_pool" | "set_proposal" | "approve" | "record_settlement" | "done" | "blocked";
  calls: ContractCall[];
  organizer: string | null;
  blockedReason: string | null;
  confirmed: repo.TransactionRow[];
}

function confirmed(db: DatabaseSync, poolId: string) {
  return repo.poolTransactions(db, poolId).filter((t) => t.network === "near-testnet" && t.status === "confirmed");
}

export function planOnchain(db: DatabaseSync, userId: string, poolId: string): OnchainPlan {
  const done = confirmed(db, poolId);
  const base = { configured: !!NEAR_CONTRACT_ID, confirmed: done, organizer: done.find((t) => t.method_name === "create_pool")?.signer_account ?? null };
  const blocked = (reason: string): OnchainPlan => ({ ...base, step: "blocked", calls: [], blockedReason: reason });
  if (!NEAR_CONTRACT_ID) return blocked("The COMMONS contract is not configured (NEXT_PUBLIC_COMMONS_CONTRACT_ID). On-chain steps are unavailable; nothing is simulated.");

  const pool = repo.getPool(db, poolId);
  if (!pool) return blocked("Pool not found.");
  repo.requireActiveMember(db, poolId, userId);
  const user = repo.getUser(db, userId)!;
  const proposal = repo.currentProposal(db, poolId);
  if (pool.status === "settled") return { ...base, step: "done", calls: [], blockedReason: null };
  if (!proposal || proposal.proposal_status !== "fully_approved") return blocked("Every participant must explicitly approve the proposal in COMMONS before it is recorded on NEAR.");
  if (!user.wallet_address) return blocked("Connect your NEAR testnet wallet first.");
  if (base.organizer && base.organizer !== user.wallet_address) return blocked(`Only the pool's on-chain organizer (${base.organizer}) can perform the next step.`);

  const allocs = repo.proposalAllocations(db, proposal.id);
  const participants = repo.activeParticipants(db, poolId).filter((p) => allocs.some((a) => a.participant_id === p.id));
  const accountFor = (p: repo.ParticipantRow) => {
    const u = repo.getUser(db, p.user_id)!;
    // Demo personas are fictional and have no wallets: in demo mode the connected
    // wallet signs on their behalf (clearly labelled in the UI).
    return u.is_demo ? user.wallet_address! : u.wallet_address;
  };
  const created = done.some((t) => t.method_name === "create_pool");
  if (!created) {
    const missing = participants.filter((p) => !accountFor(p));
    if (missing.length) return blocked(`${missing.map((m) => m.label).join(", ")} must link a NEAR wallet before the pool can be created on-chain.`);
    const intentQty = (p: repo.ParticipantRow) => (db.prepare("SELECT quantity FROM purchasing_intents WHERE id = ?").get(p.intent_id) as { quantity: number }).quantity;
    return {
      ...base,
      step: "create_pool",
      blockedReason: null,
      calls: [{
        label: "Create pool on NEAR",
        methodName: "create_pool",
        args: {
          pool_id: pool.id,
          // Contract deadline: end of the pool's deadline day (UTC), in nanoseconds.
          deadline_ns: (BigInt(Date.parse(pool.deadline + "T23:59:59Z")) * 1_000_000n).toString(),
          currency: "USD",
          participants: participants.map((p) => ({ participant_id: p.id, account_id: accountFor(p), max_contribution: String(p.maximum_unit_price * intentQty(p)) })),
        },
      }],
    };
  }
  if (!done.some((t) => t.method_name === "set_proposal")) {
    return {
      ...base, step: "set_proposal", blockedReason: null,
      calls: [{
        label: `Anchor ${proposal.label} terms hash`,
        methodName: "set_proposal",
        args: { pool_id: pool.id, proposal_hash: proposal.proposal_hash, total: String(proposal.total_cost), allocations: allocs.map((a) => ({ participant_id: a.participant_id, contribution: String(a.contribution_amount) })) },
      }],
    };
  }
  const approvedOnchain = new Set(done.filter((t) => t.method_name === "approve").map((t) => t.detail?.match(/participant (\S+)/)?.[1]));
  const pending = participants.filter((p) => !approvedOnchain.has(p.id));
  if (pending.length) {
    const signable = pending.filter((p) => accountFor(p) === user.wallet_address);
    if (!signable.length) return blocked(`Waiting for ${pending.map((p) => p.label).join(", ")} to sign their on-chain approval from their own wallet.`);
    return {
      ...base, step: "approve", blockedReason: null,
      calls: signable.map((p) => ({ label: `On-chain approval · ${p.label}`, methodName: "approve", args: { pool_id: pool.id, participant_id: p.id, proposal_hash: proposal.proposal_hash } })),
    };
  }
  return {
    ...base, step: "record_settlement", blockedReason: null,
    calls: [{ label: "Record settlement", methodName: "record_settlement", args: { pool_id: pool.id, proposal_hash: proposal.proposal_hash, settlement_ref: `commons:${proposal.id}` } }],
  };
}

/** Verify wallet-submitted hashes on NEAR testnet and record them. */
export async function recordOnchain(db: DatabaseSync, userId: string, poolId: string, hashes: string[]) {
  const user = repo.getUser(db, userId);
  if (!user?.wallet_address) throw new UserFacingError("Link your NEAR wallet first.");
  repo.requireActiveMember(db, poolId, userId);
  const proposal = repo.currentProposal(db, poolId);
  const results: { hash: string; ok: boolean; error?: string; method?: string }[] = [];

  for (const hash of hashes.slice(0, 10)) {
    if (db.prepare("SELECT 1 FROM transactions WHERE transaction_hash = ?").get(hash)) {
      results.push({ hash, ok: false, error: "Already recorded" });
      continue;
    }
    let v: VerifiedTx;
    try {
      v = await verifyTransaction(hash, user.wallet_address);
    } catch (e) {
      results.push({ hash, ok: false, error: (e as Error).message });
      continue;
    }
    if (v.args.pool_id !== poolId) {
      results.push({ hash, ok: false, error: "Transaction is for a different pool" });
      continue;
    }
    const amount =
      v.method === "set_proposal" ? Number(v.args.total) :
      v.method === "approve" ? repo.proposalAllocations(db, proposal?.id ?? "").find((a) => a.participant_id === v.args.participant_id)?.contribution_amount ?? null :
      v.method === "record_settlement" ? proposal?.total_cost ?? null : null;
    const detail = v.method === "approve" ? `participant ${String(v.args.participant_id)} approved hash ${String(v.args.proposal_hash).slice(0, 10)}…` : v.events.map((e) => e.event).join(", ") || v.failure || v.method;
    tx(db, () => {
      db.prepare(`INSERT INTO transactions (id, pool_id, user_id, transaction_type, amount, network, transaction_hash, signer_account, method_name, status, detail)
                  VALUES (?, ?, ?, ?, ?, 'near-testnet', ?, ?, ?, ?, ?)`)
        .run(newId("tx"), poolId, userId, v.method, amount, v.hash, v.signer, v.method, v.succeeded ? "confirmed" : "failed", v.succeeded ? detail : `Failed: ${v.failure}`);
      if (v.succeeded) {
        const after = planOnchain(db, userId, poolId);
        if (v.method === "record_settlement") db.prepare("UPDATE purchasing_pools SET status = 'settled', onchain_pool_id = ? WHERE id = ?").run(poolId, poolId);
        else if (after.step === "record_settlement") db.prepare("UPDATE purchasing_pools SET status = 'committed', onchain_pool_id = ? WHERE id = ?").run(poolId, poolId);
        else db.prepare("UPDATE purchasing_pools SET onchain_pool_id = ? WHERE id = ?").run(poolId, poolId);
      }
      new RunRecorder(db, poolId, userId).record(message("coordination", "Verify NEAR transaction", performance.now(), {
        inputSummary: `${v.method} tx ${v.hash.slice(0, 10)}… signed by ${v.signer}.`,
        output: { hash: v.hash, events: v.events, failure: v.failure },
        outputSummary: v.succeeded ? `Verified on NEAR testnet: ${v.method} succeeded${v.events.length ? ` (events: ${v.events.map((e) => e.event).join(", ")})` : ""}.` : `NEAR testnet reports ${v.method} failed; nothing recorded as committed.`,
        status: v.succeeded ? "succeeded" : "failed",
        validation: v.succeeded ? "passed" : "failed",
      }));
      repo.audit(db, userId, "onchain_tx_recorded", "transaction", v.hash, v.method);
    });
    results.push({ hash, ok: v.succeeded, method: v.method, error: v.failure ?? undefined });
  }
  return results;
}
