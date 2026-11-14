# COMMONS Architecture

## Layers

```
Browser (React client components)
  ├─ WalletProvider ── @hot-labs/near-connect ── user's NEAR wallet (signs)
  └─ server actions (src/app/actions.ts) ── auth + input validation (zod)
        │
Services (src/lib/services)
  ├─ pools.ts        intents, matching, join/start/withdraw, explicit decisions
  ├─ coordination.ts Coordination Agent: orchestrates a negotiation round, persists every AgentMessage
  ├─ onchain.ts      decides exact contract args per step; verifies hashes; updates state
  └─ views.ts        read models for pages
        │
Agents (src/lib/agents)          Engine (src/lib/engine) — deterministic, no I/O
  demand-intelligence.ts           money.ts     integer US cents, largest-remainder allocation
  supplier-intelligence.ts  ───►   compiler.ts  Demand Compiler: tiers, MOQ, stock, region, deadline, landed-cost budgets
  negotiation.ts                   guardian.ts  independent re-validation, approvals, settlement eligibility
  financial-guardian.ts            proposal.ts  canonical terms + SHA-256 hash
        │
Data (src/lib/db) — SQLite (node:sqlite), relational schema, repository-level authorization
        │
NEAR (src/lib/near + contract/) — testnet RPC verification; Rust contract enforcing commitment rules
```

## Agent protocol

Every agent returns an `AgentMessage<O>` (`src/lib/agents/types.ts`) containing the agent identity, task, input summary, typed output, output summary, timestamp, execution status, validation result and duration. `RunRecorder` writes each message to `agent_runs` **as it executes**, grouped by `run_group` with a sequence number. The UI timeline only reads that table, so it cannot show an action that did not happen.

A negotiation round (`runNegotiationRound`) runs inside one DB transaction:

1. Coordination: start the round (reason: manual, withdrawal, new joiner)
2. Demand Intelligence: filter compatible intents (product, region, live deadline)
3. Supplier Intelligence: assess every matching offer for the group; rank by landed total
4. Negotiation: opening proposal (lowest headline unit price that is operationally viable)
5. Financial Guardian: validate → reject or approve
6. On rejection, Negotiation: constraint-optimised search via the Demand Compiler (every offer × participant subset, excluding rejected combinations) → Guardian again (up to 3 attempts)
7. Coordination: supersede older proposals, set allocations, request explicit approvals, flag renewed approval if terms changed

## Demand Compiler

`evaluateCombination(offer, group)`:
- plans quantities (participants who accept partial fulfilment are reduced when stock is short, never below their minimum)
- picks the price tier, splits delivery by quantity with the largest-remainder method (exact to the cent)
- checks per participant: `goods + delivery share ≤ quantity × max landed unit price` (integer comparison)
- checks product, region, lead time vs deadline, verified-supplier requirement, MOQ and stock
- computes savings only against a legitimate baseline: the participant's cheapest feasible solo purchase from the same offer catalogue

`compile()` searches all subsets exhaustively up to 12 intents per offer, and prunes greedily above that. It ranks by participants served, then savings, then cost.

## Financial Guardian

`validateProposal()` trusts nothing in the proposal. It checks offer sanity (prices must not rise with volume, amounts must be positive integers), every allocation's range and budget directly, that totals add up, an independent recomputation of price and every contribution, and hash integrity. Unverified suppliers produce a warning.

## Approvals and integrity

- Proposal terms are canonicalised (fixed key order, sorted allocations) and hashed with SHA-256.
- `decide()` requires the reviewer's hash to equal the current hash, active membership, an allocation in the proposal, no earlier decision, and `approved_by_guardian` status.
- Any new round supersedes older proposals. Approvals are rows tied to `(proposal_id, proposal_hash)`, so they never transfer to changed terms.

## On-chain flow

`planOnchain()` returns the single next step with server-computed args:
`create_pool` → `set_proposal(hash, total, allocations)` → `approve` × N → `record_settlement`.
`recordOnchain()` calls RPC `tx` and requires: signer = the user's linked wallet, receiver = contract, a COMMONS method, matching `pool_id`, and success. Only then does it insert a `near-testnet` transaction row and update the pool status (`committed`, `settled`).

## Data model

Tables: users, sessions, purchasing_intents, suppliers, supplier_offers (tiers JSON, regions JSON, source_type), purchasing_pools, pool_participants (stable labels), proposals (terms_json, guardian_json, hash), proposal_allocations, approvals (hash-bound), agent_runs, transactions (network `offchain` | `near-testnet`), audit_log. All money columns are INTEGER US cents. NEAR figures in the UI are a display conversion at a live CoinGecko rate (src/lib/price.ts), cached 60 s.

## Authorization

There is no RLS in SQLite, so every service entry point takes the session user id and checks ownership or membership (`intentForUser`, `requireActiveMember`). User-supplied ids are never trusted. Demo personas cannot be signed into with a password; their sessions come from the explicit demo login.
