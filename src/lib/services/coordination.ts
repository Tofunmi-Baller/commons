/**
 * Agent 5 — Coordination. Orchestrates the other four agents sequentially,
 * persists every agent message to agent_runs (the activity timeline only ever
 * shows operations that actually executed), and manages proposal lifecycle.
 */
import type { DatabaseSync } from "node:sqlite";
import { compareSuppliers } from "../agents/supplier-intelligence";
import { openingProposal, revisedProposal, type DraftProposal } from "../agents/negotiation";
import { guardProposal } from "../agents/financial-guardian";
import { message, type AgentMessage } from "../agents/types";
import { hashTerms, termsFromEvaluation } from "../engine/proposal";
import { formatUSD } from "../engine/money";
import type { EngineIntent, Evaluation } from "../engine/types";
import * as repo from "../db/repo";
import { newId, todayISO, tx } from "../util";

export class RunRecorder {
  private seq = 0;
  readonly runGroup = newId("run");
  readonly messages: AgentMessage[] = [];
  constructor(private db: DatabaseSync, private poolId: string | null, private userId: string | null) {}

  record<O>(msg: AgentMessage<O>): AgentMessage<O> {
    this.seq += 1;
    this.messages.push(msg);
    this.db
      .prepare(`INSERT INTO agent_runs (id, pool_id, user_id, run_group, seq, agent_type, task, status, input_summary, output_summary, output_json, validation_status, duration_ms, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(newId("ar"), this.poolId, this.userId, this.runGroup, this.seq, msg.agent, msg.task, msg.status, msg.inputSummary, msg.outputSummary, JSON.stringify(msg.output ?? null), msg.validation, msg.durationMs, msg.timestamp);
    return msg;
  }
}

function analyzeDemand(intents: EngineIntent[], productKey: string, region: string, today: string) {
  const started = performance.now();
  const compatible = intents.filter((i) => (i.productKey === productKey || i.acceptableAlternatives.includes(productKey)) && i.deliveryRegion === region && i.deliveryDeadline >= today);
  const excluded = intents.filter((i) => !compatible.includes(i));
  const total = compatible.reduce((s, i) => s + i.quantity, 0);
  return message("demand_intelligence", "Identify compatible purchasing intents", started, {
    inputSummary: `${intents.length} active intent(s) in pool for ${productKey} → ${region}.`,
    output: { compatibleIds: compatible.map((c) => c.participantId), excluded: excluded.map((e) => e.participantLabel), totalQuantity: total },
    outputSummary: `Identified ${compatible.length} compatible purchasing intent(s) totalling ${total} units in ${region}.${excluded.length ? ` Excluded ${excluded.map((e) => e.participantLabel).join(", ")} (product, region or expired deadline).` : ""}`,
    status: compatible.length ? "succeeded" : "failed",
  });
}

function nextLabel(db: DatabaseSync, poolId: string) {
  const n = (db.prepare("SELECT COUNT(*) AS n FROM proposals WHERE pool_id = ?").get(poolId) as { n: number }).n;
  return `Proposal ${String.fromCharCode(65 + (n % 26))}${n >= 26 ? Math.floor(n / 26) : ""}`;
}

function persistProposal(db: DatabaseSync, poolId: string, draft: DraftProposal) {
  const ev = draft.evaluation;
  const terms = termsFromEvaluation(poolId, ev);
  const hash = hashTerms(terms);
  const id = newId("prop");
  const label = nextLabel(db, poolId);
  db.prepare(`INSERT INTO proposals (id, pool_id, supplier_offer_id, label, strategy, total_quantity, unit_price, delivery_cost, total_cost, total_savings, terms_json, proposal_status, proposal_hash, rationale)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
    .run(id, poolId, ev.offerId, label, draft.strategy, ev.totalQuantity, ev.unitPrice!, ev.deliveryCost, ev.totalCost, ev.totalSavings, JSON.stringify(terms), hash, draft.rationale);
  const alloc = db.prepare(`INSERT INTO proposal_allocations (id, proposal_id, participant_id, allocated_quantity, goods_cost, delivery_share, contribution_amount, max_allowed, baseline_cost, estimated_savings, within_budget)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const a of ev.allocations) {
    alloc.run(newId("pa"), id, a.participantId, a.allocatedQuantity, a.goodsCost, a.deliveryShare, a.contribution, a.maxAllowed, a.baselineCost, a.savings, a.withinBudget ? 1 : 0);
  }
  return { id, label, terms, hash };
}

export interface PipelineResult {
  runGroup: string;
  approvedProposalId: string | null;
  messages: AgentMessage[];
}

/**
 * Full negotiation round: demand analysis → supplier comparison → negotiation →
 * financial validation (→ revision → validation) → approval request.
 */
export function runNegotiationRound(db: DatabaseSync, poolId: string, actorUserId: string, reason: string): PipelineResult {
  const pool = repo.getPool(db, poolId);
  if (!pool) throw new Error("Pool not found");
  if (["committed", "settled", "cancelled"].includes(pool.status)) {
    throw new Error(`Pool is ${pool.status}; terms can no longer be renegotiated.`);
  }
  const today = todayISO();

  return tx(db, () => {
    const rec = new RunRecorder(db, poolId, actorUserId);
    const previous = repo.currentProposal(db, poolId);
    const previousApprovals = previous ? repo.proposalApprovals(db, previous.id).filter((a) => a.decision === "approved") : [];

    rec.record(message("coordination", "Start negotiation round", performance.now(), {
      inputSummary: `Trigger: ${reason}`,
      output: { poolId, previousProposal: previous?.label ?? null },
      outputSummary: `Started negotiation round for ${pool.product_name.split(" (")[0]}${previous ? ` (replacing ${previous.label})` : ""}.`,
    }));

    const intentsAll = repo.poolEngineIntents(db, poolId);
    const demand = rec.record(analyzeDemand(intentsAll, pool.product_key, pool.delivery_region, today));
    const intents = intentsAll.filter((i) => demand.output.compatibleIds.includes(i.participantId));
    const offers = repo.engineOffers(db);

    let approvedProposalId: string | null = null;
    if (intents.length) {
      rec.record(compareSuppliers(intents, offers, today));

      const rejected: Evaluation[] = [];
      const opening = rec.record(openingProposal(intents, offers, today));
      const attempts: DraftProposal[] = opening.output ? [opening.output] : [];

      for (let round = 0; round < 3; round++) {
        const draft = attempts[round];
        if (!draft) break;
        const saved = persistProposal(db, poolId, draft);
        const offer = offers.find((o) => o.id === draft.evaluation.offerId)!;
        const verdict = rec.record(guardProposal(saved.label, saved.terms, saved.hash, intents, offer, offers, today));
        db.prepare("UPDATE proposals SET guardian_json = ?, proposal_status = ? WHERE id = ?")
          .run(JSON.stringify(verdict.output), verdict.output.approved ? "approved_by_guardian" : "rejected_by_guardian", saved.id);
        if (verdict.output.approved) {
          approvedProposalId = saved.id;
          break;
        }
        rejected.push(draft.evaluation);
        const revised = rec.record(revisedProposal(intents, offers, today, rejected));
        if (revised.output.draft) attempts.push(revised.output.draft);
      }
    }

    if (approvedProposalId) {
      const approved = repo.getProposal(db, approvedProposalId)!;
      db.prepare("UPDATE proposals SET proposal_status = 'superseded' WHERE pool_id = ? AND id != ? AND proposal_status IN ('approved_by_guardian','fully_approved','participant_rejected')")
        .run(poolId, approvedProposalId);
      const allocs = repo.proposalAllocations(db, approvedProposalId);
      const parts = repo.activeParticipants(db, poolId);
      for (const p of parts) {
        const a = allocs.find((x) => x.participant_id === p.id);
        db.prepare("UPDATE pool_participants SET allocated_quantity = ? WHERE id = ?").run(a?.allocated_quantity ?? null, p.id);
      }
      db.prepare("UPDATE purchasing_pools SET status = 'awaiting_approval' WHERE id = ?").run(poolId);
      const reapproval = previousApprovals.filter((a) => allocs.some((x) => x.participant_id === a.participant_id)).length;
      rec.record(message("coordination", "Request participant approval", performance.now(), {
        inputSummary: `${approved.label} validated by Financial Guardian (hash ${approved.proposal_hash.slice(0, 10)}…).`,
        output: { proposalId: approvedProposalId, awaiting: allocs.map((a) => a.participant_id), renewedApprovalRequired: reapproval },
        outputSummary: `Requested explicit approval of ${approved.label} from ${allocs.length} participant(s): ${formatUSD(approved.total_cost)} total at ${formatUSD(approved.unit_price)}/unit.${reapproval ? ` ${reapproval} earlier approval(s) no longer apply because terms changed — renewed approval required.` : ""}`,
      }));
      repo.audit(db, actorUserId, "proposal_ready_for_approval", "proposal", approvedProposalId, approved.proposal_hash);
    } else {
      db.prepare("UPDATE proposals SET proposal_status = 'superseded' WHERE pool_id = ? AND proposal_status IN ('approved_by_guardian','fully_approved','participant_rejected')").run(poolId);
      db.prepare("UPDATE purchasing_pools SET status = 'forming' WHERE id = ?").run(poolId);
      rec.record(message("coordination", "Report failed negotiation", performance.now(), {
        inputSummary: "No proposal passed financial validation.",
        output: null,
        outputSummary: "No compliant deal exists for the current participants. Pool returned to forming; more demand or new offers are needed.",
        status: "failed",
      }));
    }

    return { runGroup: rec.runGroup, approvedProposalId, messages: rec.messages };
  });
}
