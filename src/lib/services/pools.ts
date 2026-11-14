import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import * as repo from "../db/repo";
import { AuthorizationError } from "../db/repo";
import { compatibilityReport } from "../engine/compiler";
import { approvalStatus } from "../engine/guardian";
import { formatUSD, dollarsToCents } from "../engine/money";
import { normalizeProduct, regionFor } from "../agents/demand-intelligence";
import { message } from "../agents/types";
import { RunRecorder, runNegotiationRound } from "./coordination";
import { newId, todayISO, tx } from "../util";

export class UserFacingError extends Error {}

export const IntentInput = z
  .object({
    productName: z.string().trim().min(2).max(120),
    productDescription: z.string().trim().max(500).optional().default(""),
    category: z.string().trim().min(2).max(60),
    quantity: z.coerce.number().int().positive().max(1_000_000),
    maxUnitPrice: z.string().trim().min(1),
    minQuantity: z.coerce.number().int().positive().max(1_000_000).optional(),
    deliveryLocation: z.string().trim().min(2).max(120),
    deliveryDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    preferredSupplierId: z.string().trim().max(64).optional().nullable(),
    acceptableAlternatives: z.array(z.string().max(60)).max(10).optional().default([]),
    partialOk: z.boolean().optional().default(false),
    requireVerifiedSupplier: z.boolean().optional().default(false),
    specialConditions: z.string().trim().max(500).optional().default(""),
    source: z.enum(["form", "natural_language"]).default("form"),
  })
  .refine((v) => (v.minQuantity ?? v.quantity) <= v.quantity, { message: "Minimum quantity cannot exceed quantity", path: ["minQuantity"] });
export type IntentInputT = z.input<typeof IntentInput>;

export function createIntent(db: DatabaseSync, userId: string, raw: IntentInputT) {
  const input = IntentInput.parse(raw);
  if (input.deliveryDeadline < todayISO()) throw new UserFacingError("Delivery deadline must be in the future.");
  let maxUnit: number;
  try {
    maxUnit = dollarsToCents(input.maxUnitPrice);
  } catch {
    throw new UserFacingError("Maximum unit price must be a naira amount, e.g. 2000 or 1,250.50.");
  }
  if (maxUnit <= 0) throw new UserFacingError("Maximum unit price must be greater than zero.");
  const region = regionFor(input.deliveryLocation);
  if (!region) throw new UserFacingError(`We don't recognise "${input.deliveryLocation}". Include a Nigerian city or state, e.g. "Ikeja, Lagos".`);
  const product = normalizeProduct(`${input.productName} ${input.productDescription}`);
  const productKey = product?.key ?? `custom:${input.productName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
  if (input.preferredSupplierId && !db.prepare("SELECT 1 FROM suppliers WHERE id = ?").get(input.preferredSupplierId)) {
    throw new UserFacingError("Preferred supplier not found.");
  }
  const id = newId("int");
  db.prepare(`INSERT INTO purchasing_intents (id, user_id, product_name, product_key, product_description, category, quantity, max_unit_price, min_quantity,
      delivery_location, delivery_region, delivery_deadline, preferred_supplier_id, acceptable_alternatives, partial_ok, require_verified_supplier, special_conditions, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, product?.name ?? input.productName, productKey, input.productDescription, product?.category ?? input.category, input.quantity, maxUnit,
      input.partialOk ? input.minQuantity ?? input.quantity : input.quantity, input.deliveryLocation, region, input.deliveryDeadline,
      input.preferredSupplierId || null, JSON.stringify(input.acceptableAlternatives), input.partialOk ? 1 : 0, input.requireVerifiedSupplier ? 1 : 0,
      input.specialConditions, input.source);
  repo.audit(db, userId, "intent_created", "intent", id);
  return { id, productKey, region, normalized: product !== null };
}

/** Demand matching for one intent: compatible pools and offers, each with reasons. */
export function matchIntent(db: DatabaseSync, userId: string, intentId: string) {
  const intent = repo.intentForUser(db, userId, intentId);
  const engineIntent = repo.toEngineIntent(intent, { id: "self", label: "Your intent" });
  const today = todayISO();
  const rec = new RunRecorder(db, null, userId);
  const started = performance.now();

  const pools = repo.listPools(db, userId).filter((p) => ["forming", "negotiating", "awaiting_approval"].includes(p.status));
  const poolMatches = pools.map((p) => {
    const reasons: string[] = [];
    if (p.product_key !== intent.product_key && !engineIntent.acceptableAlternatives.includes(p.product_key)) reasons.push(`Different product (${p.product_name}).`);
    if (p.delivery_region !== intent.delivery_region) reasons.push(`Delivers to ${p.delivery_region}, you need ${intent.delivery_region}.`);
    if (p.deadline > intent.delivery_deadline) reasons.push(`Pool closes ${p.deadline}, after your delivery deadline ${intent.delivery_deadline}.`);
    if (p.user_is_member) reasons.push("You are already in this pool.");
    return {
      poolId: p.id,
      productName: p.product_name,
      participants: p.participant_count,
      totalDemand: p.total_demand,
      compatible: reasons.length === 0,
      reasons: reasons.length ? reasons : [`Same product, same region (${p.delivery_region}); adding your ${intent.quantity} units brings demand to ${p.total_demand + intent.quantity}.`],
    };
  });
  const offers = compatibilityReport(engineIntent, repo.engineOffers(db, [intent.product_key, ...engineIntent.acceptableAlternatives]), today);
  const compatiblePools = poolMatches.filter((m) => m.compatible).length;
  rec.record(message("demand_intelligence", "Match purchasing intent to pools", started, {
    inputSummary: `${intent.product_name.split(" (")[0]} × ${intent.quantity} → ${intent.delivery_region}, max ${formatUSD(intent.max_unit_price)}/unit.`,
    output: { poolMatches, offers },
    outputSummary: `Checked ${poolMatches.length} open pool(s): ${compatiblePools} compatible. ${offers.filter((o) => o.compatible).length} supplier offer(s) can deliver to ${intent.delivery_region} in time.`,
  }));
  return { intent, poolMatches, offers };
}

function nextParticipantLabel(db: DatabaseSync, poolId: string) {
  const n = repo.poolParticipants(db, poolId).length;
  return `Participant ${String.fromCharCode(65 + (n % 26))}${n >= 26 ? Math.floor(n / 26) : ""}`;
}

export function joinPool(db: DatabaseSync, userId: string, poolId: string, intentId: string) {
  const intent = repo.intentForUser(db, userId, intentId);
  const pool = repo.getPool(db, poolId);
  if (!pool) throw new UserFacingError("Pool not found.");
  if (!["forming", "negotiating", "awaiting_approval"].includes(pool.status)) throw new UserFacingError(`Pool is ${pool.status} and not accepting participants.`);
  if (intent.status !== "open") throw new UserFacingError("That intent is already in a pool.");
  if (intent.product_key !== pool.product_key && !JSON.parse(intent.acceptable_alternatives).includes(pool.product_key)) throw new UserFacingError("Your intent's product is not compatible with this pool.");
  if (intent.delivery_region !== pool.delivery_region) throw new UserFacingError("Your delivery region does not match this pool.");
  const existing = repo.membership(db, poolId, userId);
  tx(db, () => {
    if (existing) {
      if (existing.status === "active") throw new UserFacingError("You are already in this pool.");
      db.prepare("UPDATE pool_participants SET status = 'active', intent_id = ?, maximum_unit_price = ?, allocated_quantity = NULL WHERE id = ?").run(intentId, intent.max_unit_price, existing.id);
    } else {
      db.prepare("INSERT INTO pool_participants (id, pool_id, user_id, intent_id, label, maximum_unit_price) VALUES (?, ?, ?, ?, ?, ?)")
        .run(newId("pp"), poolId, userId, intentId, nextParticipantLabel(db, poolId), intent.max_unit_price);
    }
    db.prepare("UPDATE purchasing_intents SET status = 'pooled' WHERE id = ?").run(intentId);
    repo.audit(db, userId, "pool_joined", "pool", poolId, intentId);
  });
  // Membership changed: any existing proposal no longer reflects the group.
  if (repo.currentProposal(db, poolId)) {
    runNegotiationRound(db, poolId, userId, "A new participant joined; the group must be recalculated.");
  }
}

export function startPool(db: DatabaseSync, userId: string, intentId: string, opts: { poolId?: string } = {}) {
  const intent = repo.intentForUser(db, userId, intentId);
  if (intent.status !== "open") throw new UserFacingError("That intent is already in a pool.");
  const poolId = opts.poolId ?? newId("pool");
  const offers = repo.engineOffers(db, [intent.product_key]);
  const target = offers.length ? Math.min(...offers.map((o) => o.minimumOrderQuantity)) : intent.quantity;
  db.prepare(`INSERT INTO purchasing_pools (id, product_name, product_key, category, delivery_region, target_quantity, deadline, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(poolId, intent.product_name, intent.product_key, intent.category, intent.delivery_region, Math.max(target, intent.quantity), intent.delivery_deadline, userId);
  repo.audit(db, userId, "pool_created", "pool", poolId);
  joinPool(db, userId, poolId, intentId);
  return poolId;
}

export function withdraw(db: DatabaseSync, userId: string, poolId: string) {
  const me = repo.requireActiveMember(db, poolId, userId);
  const pool = repo.getPool(db, poolId)!;
  if (["committed", "settled"].includes(pool.status)) throw new UserFacingError("Commitment is recorded; withdrawal now follows the cancellation and refund rules.");
  tx(db, () => {
    db.prepare("UPDATE pool_participants SET status = 'withdrawn', allocated_quantity = NULL WHERE id = ?").run(me.id);
    db.prepare("UPDATE purchasing_intents SET status = 'open' WHERE id = ?").run(me.intent_id);
    repo.audit(db, userId, "pool_withdrawn", "pool", poolId);
  });
  if (repo.activeParticipants(db, poolId).length && repo.currentProposal(db, poolId)) {
    return runNegotiationRound(db, poolId, userId, `${me.label} withdrew before commitment; recalculating the group.`);
  }
  if (!repo.activeParticipants(db, poolId).length) db.prepare("UPDATE purchasing_pools SET status = 'cancelled' WHERE id = ?").run(poolId);
  return null;
}

export function negotiate(db: DatabaseSync, userId: string, poolId: string) {
  repo.requireActiveMember(db, poolId, userId);
  return runNegotiationRound(db, poolId, userId, "Participant requested a negotiation round.");
}

export type Decision = "approved" | "rejected" | "revision_requested";

/**
 * Record a participant's explicit decision on the exact terms they reviewed.
 * `reviewedHash` must equal the proposal's current hash, so terms cannot be
 * swapped between review and approval.
 */
export function decide(db: DatabaseSync, userId: string, proposalId: string, decision: Decision, reviewedHash: string, note?: string) {
  const proposal = repo.getProposal(db, proposalId);
  if (!proposal) throw new UserFacingError("Proposal not found.");
  const me = repo.requireActiveMember(db, proposal.pool_id, userId);
  const current = repo.currentProposal(db, proposal.pool_id);
  if (!current || current.id !== proposalId || proposal.proposal_status !== "approved_by_guardian") {
    throw new UserFacingError("This proposal is no longer open for decisions.");
  }
  if (reviewedHash !== proposal.proposal_hash) throw new UserFacingError("The proposal changed since you reviewed it. Please review the new terms.");
  const allocs = repo.proposalAllocations(db, proposalId);
  const mine = allocs.find((a) => a.participant_id === me.id);
  if (!mine) throw new AuthorizationError("You have no allocation in this proposal.");
  if (repo.proposalApprovals(db, proposalId).some((a) => a.participant_id === me.id)) throw new UserFacingError("You already decided on this proposal.");

  return tx(db, () => {
    db.prepare("INSERT INTO approvals (id, proposal_id, participant_id, proposal_hash, decision, note) VALUES (?, ?, ?, ?, ?, ?)")
      .run(newId("apv"), proposalId, me.id, proposal.proposal_hash, decision, note?.slice(0, 500) ?? null);
    db.prepare(`INSERT INTO transactions (id, pool_id, user_id, transaction_type, amount, network, status, detail) VALUES (?, ?, ?, ?, ?, 'offchain', 'recorded', ?)`)
      .run(newId("tx"), proposal.pool_id, userId, `approval_${decision}`, mine.contribution_amount, `${me.label} ${decision.replace("_", " ")} ${proposal.label} (hash ${proposal.proposal_hash.slice(0, 10)}…)`);
    repo.audit(db, userId, `proposal_${decision}`, "proposal", proposalId, proposal.proposal_hash);

    const rec = new RunRecorder(db, proposal.pool_id, userId);
    const ids = allocs.map((a) => a.participant_id);
    const status = approvalStatus(ids, repo.proposalApprovals(db, proposalId).map((a) => ({ participantId: a.participant_id, decision: a.decision, proposalHash: a.proposal_hash })), proposal.proposal_hash);
    if (decision !== "approved") {
      db.prepare("UPDATE proposals SET proposal_status = 'participant_rejected' WHERE id = ?").run(proposalId);
      db.prepare("UPDATE purchasing_pools SET status = 'negotiating' WHERE id = ?").run(proposal.pool_id);
      rec.record(message("coordination", "Handle participant decision", performance.now(), {
        inputSummary: `${me.label} ${decision.replace("_", " ")} ${proposal.label}.`,
        output: status,
        outputSummary: `${me.label} ${decision === "rejected" ? "rejected" : "requested a revision of"} ${proposal.label}. Settlement blocked; a new negotiation round is required.`,
        status: "rejected",
      }));
    } else if (status.complete) {
      db.prepare("UPDATE proposals SET proposal_status = 'fully_approved' WHERE id = ?").run(proposalId);
      db.prepare("UPDATE purchasing_pools SET status = 'approved' WHERE id = ?").run(proposal.pool_id);
      rec.record(message("coordination", "Confirm all approvals", performance.now(), {
        inputSummary: `${me.label} approved ${proposal.label}.`,
        output: status,
        outputSummary: `All ${ids.length} participants explicitly approved ${proposal.label}. Ready to record the commitment on NEAR.`,
        validation: "passed",
      }));
    } else {
      rec.record(message("coordination", "Track approvals", performance.now(), {
        inputSummary: `${me.label} approved ${proposal.label}.`,
        output: status,
        outputSummary: `${status.approved.length}/${ids.length} approvals received for ${proposal.label}; waiting on ${status.missing.length}.`,
      }));
    }
    return status;
  });
}

export function updateWallet(db: DatabaseSync, userId: string, accountId: string | null) {
  if (accountId !== null && !/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(accountId)) throw new UserFacingError("Invalid NEAR account id.");
  db.prepare("UPDATE users SET wallet_address = ? WHERE id = ?").run(accountId, userId);
  repo.audit(db, userId, accountId ? "wallet_linked" : "wallet_unlinked", "user", userId, accountId ?? undefined);
}
