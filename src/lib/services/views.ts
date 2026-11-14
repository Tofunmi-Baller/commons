/** Read models for pages. All figures come from persisted application state. */
import type { DatabaseSync } from "node:sqlite";
import * as repo from "../db/repo";
import { approvalStatus, settlementEligibility, type GuardianVerdict } from "../engine/guardian";
import { todayISO } from "../util";

export function dashboard(db: DatabaseSync, userId: string) {
  const pools = repo.listPools(db, userId);
  const mine = pools.filter((p) => p.user_is_member);
  const active = mine.filter((p) => !["settled", "cancelled"].includes(p.status));
  let savings: number | null = null;
  const pending: { poolId: string; product: string; proposalLabel: string }[] = [];
  const myCosts: { pool: string; solo: number | null; collective: number }[] = [];

  for (const p of mine) {
    const proposal = repo.currentProposal(db, p.id);
    if (!proposal) continue;
    if (proposal.total_savings !== null && p.status !== "cancelled") savings = (savings ?? 0) + proposal.total_savings;
    const me = repo.membership(db, p.id, userId)!;
    const alloc = repo.proposalAllocations(db, proposal.id).find((a) => a.participant_id === me.id);
    if (alloc) {
      myCosts.push({ pool: p.product_name.split(" (")[0], solo: alloc.baseline_cost, collective: alloc.contribution_amount });
      const decided = repo.proposalApprovals(db, proposal.id).some((a) => a.participant_id === me.id);
      if (proposal.proposal_status === "approved_by_guardian" && !decided) pending.push({ poolId: p.id, product: p.product_name, proposalLabel: proposal.label });
    }
  }
  const myIntents = repo.intentsForUser(db, userId);
  const openIntents = myIntents.filter((i) => i.status === "open");
  const opportunities = pools.filter(
    (p) => !p.user_is_member && ["forming", "negotiating", "awaiting_approval"].includes(p.status) &&
      (openIntents.length === 0 || openIntents.some((i) => i.product_key === p.product_key && i.delivery_region === p.delivery_region)),
  );
  return {
    activePools: active,
    totalDemandUnits: active.reduce((s, p) => s + p.total_demand, 0),
    savings,
    pending,
    myCosts,
    opportunities,
    deadlines: [...active].sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5),
    recentRuns: repo.agentRunsForUser(db, userId, 6),
    openIntents,
  };
}

export function poolDetail(db: DatabaseSync, userId: string, poolId: string) {
  const pool = repo.getPool(db, poolId);
  if (!pool) return null;
  const participants = repo.poolParticipants(db, poolId);
  const me = participants.find((p) => p.user_id === userId && p.status === "active") ?? null;
  const intents = new Map(participants.map((p) => [p.id, db.prepare("SELECT quantity, delivery_location, delivery_deadline FROM purchasing_intents WHERE id = ?").get(p.intent_id) as { quantity: number; delivery_location: string; delivery_deadline: string }]));
  const offers = repo.offerRows(db, [pool.product_key]);
  const proposals = repo.poolProposals(db, poolId).map((pr) => {
    const allocs = repo.proposalAllocations(db, pr.id);
    const approvals = repo.proposalApprovals(db, pr.id);
    return {
      ...pr,
      guardian: pr.guardian_json ? (JSON.parse(pr.guardian_json) as GuardianVerdict) : null,
      allocations: allocs.map((a) => ({ ...a, label: participants.find((p) => p.id === a.participant_id)?.label ?? "?", isMe: a.participant_id === me?.id })),
      approvals,
      offer: offers.find((o) => o.id === pr.supplier_offer_id) ?? null,
    };
  });
  const current = repo.currentProposal(db, poolId);
  const currentView = current ? proposals.find((p) => p.id === current.id) ?? null : null;
  const approval = current
    ? approvalStatus(currentView!.allocations.map((a) => a.participant_id), currentView!.approvals.map((a) => ({ participantId: a.participant_id, decision: a.decision, proposalHash: a.proposal_hash })), current.proposal_hash)
    : null;
  const settlement = current
    ? settlementEligibility({
        proposalStatus: current.proposal_status,
        guardianApproved: currentView!.guardian?.approved ?? false,
        participantIds: currentView!.allocations.map((a) => a.participant_id),
        approvals: currentView!.approvals.map((a) => ({ participantId: a.participant_id, decision: a.decision, proposalHash: a.proposal_hash })),
        proposalHash: current.proposal_hash,
        deadline: pool.deadline,
        today: todayISO(),
        alreadySettled: pool.status === "settled",
        cancelled: pool.status === "cancelled",
      })
    : null;
  const myIntent = me ? (db.prepare("SELECT * FROM purchasing_intents WHERE id = ?").get(me.intent_id) as unknown as repo.IntentRow) : null;
  return {
    pool,
    me,
    myIntent,
    participants: participants.map((p) => ({ id: p.id, label: p.label, status: p.status, isMe: p.user_id === userId, quantity: intents.get(p.id)?.quantity ?? 0, location: intents.get(p.id)?.delivery_location ?? "" })),
    offers,
    proposals,
    current: currentView,
    approval,
    settlement,
    runs: repo.poolAgentRuns(db, poolId),
    transactions: repo.poolTransactions(db, poolId),
  };
}

export type PoolDetail = NonNullable<ReturnType<typeof poolDetail>>;
