/**
 * Data access layer. Every function that touches private data takes the
 * acting user's id and enforces ownership/membership itself — this is the
 * application-level equivalent of row-level security.
 */
import type { DatabaseSync } from "node:sqlite";
import type { EngineIntent, EngineOffer, PriceTier } from "../engine/types";

export class AuthorizationError extends Error {
  constructor(msg = "You are not allowed to access this resource.") {
    super(msg);
    this.name = "AuthorizationError";
  }
}

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  business_name: string | null;
  location: string | null;
  wallet_address: string | null;
  is_demo: number;
  created_at: string;
}

export interface PoolRow {
  id: string;
  product_name: string;
  product_key: string;
  category: string;
  delivery_region: string;
  target_quantity: number;
  status: string;
  deadline: string;
  created_by: string;
  is_demo: number;
  onchain_pool_id: string | null;
  created_at: string;
}

export interface ParticipantRow {
  id: string;
  pool_id: string;
  user_id: string;
  intent_id: string;
  label: string;
  allocated_quantity: number | null;
  maximum_unit_price: number;
  status: string;
  joined_at: string;
}

export interface IntentRow {
  id: string;
  user_id: string;
  product_name: string;
  product_key: string;
  product_description: string | null;
  category: string;
  quantity: number;
  max_unit_price: number;
  min_quantity: number;
  delivery_location: string;
  delivery_region: string;
  delivery_deadline: string;
  preferred_supplier_id: string | null;
  acceptable_alternatives: string;
  partial_ok: number;
  require_verified_supplier: number;
  special_conditions: string | null;
  source: string;
  status: string;
  created_at: string;
}

export interface ProposalRow {
  id: string;
  pool_id: string;
  supplier_offer_id: string;
  label: string;
  strategy: string;
  total_quantity: number;
  unit_price: number;
  delivery_cost: number;
  total_cost: number;
  total_savings: number | null;
  terms_json: string;
  guardian_json: string | null;
  proposal_status: string;
  proposal_hash: string;
  rationale: string;
  created_at: string;
}

export interface AllocationRow {
  id: string;
  proposal_id: string;
  participant_id: string;
  allocated_quantity: number;
  goods_cost: number;
  delivery_share: number;
  contribution_amount: number;
  max_allowed: number;
  baseline_cost: number | null;
  estimated_savings: number | null;
  within_budget: number;
}

export interface ApprovalRow {
  id: string;
  proposal_id: string;
  participant_id: string;
  proposal_hash: string;
  decision: "approved" | "rejected" | "revision_requested";
  note: string | null;
  approved_at: string;
}

export interface AgentRunRow {
  id: string;
  pool_id: string | null;
  user_id: string | null;
  run_group: string;
  seq: number;
  agent_type: string;
  task: string;
  status: string;
  input_summary: string;
  output_summary: string;
  output_json: string | null;
  validation_status: string;
  duration_ms: number;
  created_at: string;
}

export interface TransactionRow {
  id: string;
  pool_id: string | null;
  user_id: string | null;
  transaction_type: string;
  amount: number | null;
  currency: string;
  network: "near-testnet" | "offchain";
  transaction_hash: string | null;
  signer_account: string | null;
  method_name: string | null;
  status: string;
  detail: string | null;
  created_at: string;
}

export interface OfferRow {
  id: string;
  supplier_id: string;
  supplier_name: string;
  verification_status: string;
  product_key: string;
  product_name: string;
  category: string;
  price_tiers: string;
  minimum_order_quantity: number;
  available_quantity: number;
  delivery_cost: number;
  delivery_days: number;
  serves_regions: string;
  source_type: "sample" | "supplier_submitted";
}

// node:sqlite returns null-prototype rows; copy them into plain objects so they
// can cross the server → client component boundary.
const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;
const all = <T>(db: DatabaseSync, sql: string, ...params: (string | number | null)[]) => db.prepare(sql).all(...params).map((r) => plain<T>(r));
const one = <T>(db: DatabaseSync, sql: string, ...params: (string | number | null)[]) => {
  const r = db.prepare(sql).get(...params);
  return r === undefined ? undefined : plain<T>(r);
};

// ── Users ────────────────────────────────────────────────────────────────
export const getUser = (db: DatabaseSync, id: string) => one<UserRow>(db, "SELECT * FROM users WHERE id = ?", id);
export const demoUsers = (db: DatabaseSync) => all<UserRow>(db, "SELECT * FROM users WHERE is_demo = 1 ORDER BY id");

// ── Offers ───────────────────────────────────────────────────────────────
export function offerRows(db: DatabaseSync, productKeys?: string[]): OfferRow[] {
  const rows = all<OfferRow>(db, `SELECT o.*, s.name AS supplier_name, s.verification_status FROM supplier_offers o JOIN suppliers s ON s.id = o.supplier_id ORDER BY o.id`);
  return productKeys ? rows.filter((r) => productKeys.includes(r.product_key)) : rows;
}

export function toEngineOffer(r: OfferRow): EngineOffer {
  return {
    id: r.id,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    supplierVerified: r.verification_status === "verified",
    productKey: r.product_key,
    productName: r.product_name,
    tiers: JSON.parse(r.price_tiers) as PriceTier[],
    minimumOrderQuantity: r.minimum_order_quantity,
    availableQuantity: r.available_quantity,
    deliveryCost: r.delivery_cost,
    deliveryDays: r.delivery_days,
    servesRegions: JSON.parse(r.serves_regions) as string[],
    sourceType: r.source_type,
  };
}

export const engineOffers = (db: DatabaseSync, productKeys?: string[]) => offerRows(db, productKeys).map(toEngineOffer);

// ── Intents ──────────────────────────────────────────────────────────────
export function toEngineIntent(intent: IntentRow, participant: { id: string; label: string }): EngineIntent {
  return {
    id: intent.id,
    participantId: participant.id,
    participantLabel: participant.label,
    productKey: intent.product_key,
    productName: intent.product_name,
    quantity: intent.quantity,
    minQuantity: intent.min_quantity,
    maxUnitPrice: intent.max_unit_price,
    deliveryRegion: intent.delivery_region,
    deliveryLocation: intent.delivery_location,
    deliveryDeadline: intent.delivery_deadline,
    preferredSupplierId: intent.preferred_supplier_id,
    acceptableAlternatives: JSON.parse(intent.acceptable_alternatives) as string[],
    partialOk: intent.partial_ok === 1,
    requireVerifiedSupplier: intent.require_verified_supplier === 1,
  };
}

export const intentsForUser = (db: DatabaseSync, userId: string) =>
  all<IntentRow>(db, "SELECT * FROM purchasing_intents WHERE user_id = ? ORDER BY created_at DESC", userId);

export function intentForUser(db: DatabaseSync, userId: string, intentId: string): IntentRow {
  const row = one<IntentRow>(db, "SELECT * FROM purchasing_intents WHERE id = ?", intentId);
  if (!row || row.user_id !== userId) throw new AuthorizationError("That purchasing intent does not belong to you.");
  return row;
}

// ── Pools ────────────────────────────────────────────────────────────────
export const getPool = (db: DatabaseSync, id: string) => one<PoolRow>(db, "SELECT * FROM purchasing_pools WHERE id = ?", id);

export interface PoolSummary extends PoolRow {
  participant_count: number;
  total_demand: number;
  best_unit_price: number | null;
  user_is_member: number;
}

export function listPools(db: DatabaseSync, viewerId: string): PoolSummary[] {
  return all<PoolSummary>(
    db,
    `SELECT p.*,
       (SELECT COUNT(*) FROM pool_participants pp WHERE pp.pool_id = p.id AND pp.status = 'active') AS participant_count,
       (SELECT COALESCE(SUM(i.quantity),0) FROM pool_participants pp JOIN purchasing_intents i ON i.id = pp.intent_id WHERE pp.pool_id = p.id AND pp.status = 'active') AS total_demand,
       (SELECT pr.unit_price FROM proposals pr WHERE pr.pool_id = p.id AND pr.proposal_status IN ('approved_by_guardian','fully_approved') ORDER BY pr.created_at DESC LIMIT 1) AS best_unit_price,
       EXISTS (SELECT 1 FROM pool_participants pp WHERE pp.pool_id = p.id AND pp.user_id = ? AND pp.status = 'active') AS user_is_member
     FROM purchasing_pools p ORDER BY p.created_at DESC`,
    viewerId,
  );
}

export const poolParticipants = (db: DatabaseSync, poolId: string) =>
  all<ParticipantRow>(db, "SELECT * FROM pool_participants WHERE pool_id = ? ORDER BY label", poolId);

export const activeParticipants = (db: DatabaseSync, poolId: string) =>
  all<ParticipantRow>(db, "SELECT * FROM pool_participants WHERE pool_id = ? AND status = 'active' ORDER BY label", poolId);

export function membership(db: DatabaseSync, poolId: string, userId: string) {
  return one<ParticipantRow>(db, "SELECT * FROM pool_participants WHERE pool_id = ? AND user_id = ?", poolId, userId);
}

export function requireActiveMember(db: DatabaseSync, poolId: string, userId: string): ParticipantRow {
  const m = membership(db, poolId, userId);
  if (!m || m.status !== "active") throw new AuthorizationError("Only active participants of this pool can do that.");
  return m;
}

/** Engine intents for the active participants of a pool. */
export function poolEngineIntents(db: DatabaseSync, poolId: string): EngineIntent[] {
  return activeParticipants(db, poolId).map((p) => {
    const intent = one<IntentRow>(db, "SELECT * FROM purchasing_intents WHERE id = ?", p.intent_id)!;
    return toEngineIntent(intent, p);
  });
}

// ── Proposals ────────────────────────────────────────────────────────────
export const poolProposals = (db: DatabaseSync, poolId: string) =>
  all<ProposalRow>(db, "SELECT * FROM proposals WHERE pool_id = ? ORDER BY created_at, rowid", poolId);

export const getProposal = (db: DatabaseSync, id: string) => one<ProposalRow>(db, "SELECT * FROM proposals WHERE id = ?", id);

export function currentProposal(db: DatabaseSync, poolId: string): ProposalRow | undefined {
  return one<ProposalRow>(
    db,
    "SELECT * FROM proposals WHERE pool_id = ? AND proposal_status IN ('approved_by_guardian','fully_approved','participant_rejected') ORDER BY created_at DESC, rowid DESC LIMIT 1",
    poolId,
  );
}

export const proposalAllocations = (db: DatabaseSync, proposalId: string) =>
  all<AllocationRow>(db, "SELECT * FROM proposal_allocations WHERE proposal_id = ?", proposalId);

export const proposalApprovals = (db: DatabaseSync, proposalId: string) =>
  all<ApprovalRow>(db, "SELECT * FROM approvals WHERE proposal_id = ? ORDER BY approved_at", proposalId);

// ── Agent runs & transactions ────────────────────────────────────────────
export const poolAgentRuns = (db: DatabaseSync, poolId: string) =>
  all<AgentRunRow>(db, "SELECT * FROM agent_runs WHERE pool_id = ? ORDER BY created_at, seq", poolId);

export function agentRunsForUser(db: DatabaseSync, userId: string, limit = 50) {
  return all<AgentRunRow & { product_name: string | null }>(
    db,
    `SELECT r.*, p.product_name FROM agent_runs r LEFT JOIN purchasing_pools p ON p.id = r.pool_id
     WHERE r.user_id = ? OR r.pool_id IN (SELECT pool_id FROM pool_participants WHERE user_id = ?)
     ORDER BY r.created_at DESC, r.seq DESC LIMIT ?`,
    userId, userId, limit,
  );
}

export function transactionsForUser(db: DatabaseSync, userId: string) {
  return all<TransactionRow & { product_name: string | null }>(
    db,
    `SELECT t.*, p.product_name FROM transactions t LEFT JOIN purchasing_pools p ON p.id = t.pool_id
     WHERE t.user_id = ? OR t.pool_id IN (SELECT pool_id FROM pool_participants WHERE user_id = ?)
     ORDER BY t.created_at DESC`,
    userId, userId,
  );
}

export const poolTransactions = (db: DatabaseSync, poolId: string) =>
  all<TransactionRow>(db, "SELECT * FROM transactions WHERE pool_id = ? ORDER BY created_at", poolId);

export function audit(db: DatabaseSync, actor: string | null, action: string, entity: string, entityId: string | null, detail?: string) {
  db.prepare("INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)").run(actor, action, entity, entityId, detail ?? null);
}
