/**
 * Relational schema (SQLite dialect, Postgres-compatible design).
 * Money columns are INTEGER cents. Foreign keys, CHECK constraints and indexes
 * are enforced by the database; per-user access control is enforced in the
 * repository layer (see src/lib/db/repo.ts) because SQLite has no RLS.
 */
export const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  business_name TEXT,
  location TEXT,
  wallet_address TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchasing_intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_key TEXT NOT NULL,
  product_description TEXT,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  max_unit_price INTEGER NOT NULL CHECK (max_unit_price > 0),
  min_quantity INTEGER NOT NULL CHECK (min_quantity > 0),
  delivery_location TEXT NOT NULL,
  delivery_region TEXT NOT NULL,
  delivery_deadline TEXT NOT NULL,
  preferred_supplier_id TEXT REFERENCES suppliers(id),
  acceptable_alternatives TEXT NOT NULL DEFAULT '[]',
  partial_ok INTEGER NOT NULL DEFAULT 0,
  require_verified_supplier INTEGER NOT NULL DEFAULT 0,
  special_conditions TEXT,
  source TEXT NOT NULL DEFAULT 'form' CHECK (source IN ('form','natural_language')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pooled','withdrawn','fulfilled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (min_quantity <= quantity)
);
CREATE INDEX IF NOT EXISTS idx_intents_user ON purchasing_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_intents_product ON purchasing_intents(product_key, delivery_region, status);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified','unverified')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS supplier_offers (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_key TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_tiers TEXT NOT NULL,
  minimum_order_quantity INTEGER NOT NULL CHECK (minimum_order_quantity > 0),
  available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
  delivery_cost INTEGER NOT NULL CHECK (delivery_cost >= 0),
  delivery_days INTEGER NOT NULL CHECK (delivery_days >= 0),
  serves_regions TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('sample','supplier_submitted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_offers_product ON supplier_offers(product_key);

CREATE TABLE IF NOT EXISTS purchasing_pools (
  id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  product_key TEXT NOT NULL,
  category TEXT NOT NULL,
  delivery_region TEXT NOT NULL,
  target_quantity INTEGER NOT NULL CHECK (target_quantity > 0),
  status TEXT NOT NULL DEFAULT 'forming' CHECK (status IN ('forming','negotiating','awaiting_approval','approved','committed','settled','cancelled')),
  deadline TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  is_demo INTEGER NOT NULL DEFAULT 0,
  onchain_pool_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pools_status ON purchasing_pools(status, product_key);

CREATE TABLE IF NOT EXISTS pool_participants (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES purchasing_pools(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  intent_id TEXT NOT NULL REFERENCES purchasing_intents(id),
  label TEXT NOT NULL,
  allocated_quantity INTEGER,
  maximum_unit_price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn','excluded')),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (pool_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_participants_user ON pool_participants(user_id);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES purchasing_pools(id) ON DELETE CASCADE,
  supplier_offer_id TEXT NOT NULL REFERENCES supplier_offers(id),
  label TEXT NOT NULL,
  strategy TEXT NOT NULL,
  total_quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  delivery_cost INTEGER NOT NULL,
  total_cost INTEGER NOT NULL,
  total_savings INTEGER,
  terms_json TEXT NOT NULL,
  guardian_json TEXT,
  proposal_status TEXT NOT NULL CHECK (proposal_status IN ('draft','rejected_by_guardian','approved_by_guardian','fully_approved','superseded','participant_rejected')),
  proposal_hash TEXT NOT NULL,
  rationale TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_proposals_pool ON proposals(pool_id, created_at);

CREATE TABLE IF NOT EXISTS proposal_allocations (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES pool_participants(id),
  allocated_quantity INTEGER NOT NULL,
  goods_cost INTEGER NOT NULL,
  delivery_share INTEGER NOT NULL,
  contribution_amount INTEGER NOT NULL,
  max_allowed INTEGER NOT NULL,
  baseline_cost INTEGER,
  estimated_savings INTEGER,
  within_budget INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alloc_proposal ON proposal_allocations(proposal_id);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES pool_participants(id),
  proposal_hash TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected','revision_requested')),
  note TEXT,
  approved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (proposal_id, participant_id)
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  pool_id TEXT REFERENCES purchasing_pools(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  run_group TEXT NOT NULL,
  seq INTEGER NOT NULL,
  agent_type TEXT NOT NULL CHECK (agent_type IN ('demand_intelligence','supplier_intelligence','negotiation','financial_guardian','coordination')),
  task TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded','failed','rejected','needs_input')),
  input_summary TEXT NOT NULL,
  output_summary TEXT NOT NULL,
  output_json TEXT,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('passed','failed','not_applicable')),
  duration_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_runs_pool ON agent_runs(pool_id, created_at);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  pool_id TEXT REFERENCES purchasing_pools(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  transaction_type TEXT NOT NULL,
  amount INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  network TEXT NOT NULL CHECK (network IN ('near-testnet','offchain')),
  transaction_hash TEXT,
  signer_account TEXT,
  method_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('recorded','pending','confirmed','failed')),
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (transaction_hash)
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;
