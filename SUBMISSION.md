# COMMONS: Hackathon submission

## Why COMMONS exists

Small businesses everywhere (a bakery in Brooklyn, a café in Kreuzberg, a kitchen in Singapore) buy packaging, groceries and supplies alone. They pay retail-tier prices and absorb full delivery costs, while larger competitors get volume discounts. Pooling purchases is worth doing but hard to coordinate: buyers need to find compatible demand, agree on terms, and trust each other's commitments.

## What is innovative

1. **A Demand Compiler, not a group-buy button.** It decides whether a combination of buyers and an offer is *viable*: price tiers, minimum orders, stock, regions, lead times, and each buyer's maximum **landed** price including their delivery share.
2. **Agents that are checked by deterministic rules.** Five agents with separate jobs. The Negotiation agent's proposals are untrusted until a deterministic Financial Guardian recomputes them. The demo shows the Guardian rejecting a headline-cheap deal that would break one buyer's budget.
3. **Hash-bound consent.** Each participant approves a SHA-256 hash of the exact terms. Changed terms void earlier approvals, both in the app and in the contract.
4. **Complete audit trail.** Every agent step on screen is a database record written when it executed.

## Why NEAR

Collective purchasing among strangers needs a neutral record that no single participant or the platform can quietly rewrite. The NEAR contract holds the pool, each participant's committed maximum, the agreed terms hash and each participant's own signed approval. It enforces the rules: no settlement without everyone, no double settlement, no changing terms after full approval, and explicit cancellation and refund eligibility. NEAR's low fees and named accounts make per-participant approval transactions practical for small businesses, and its account model maps naturally to future agent-held function-call keys.

## Genuinely implemented

- Full web app: landing, auth, dashboard, demand creation (natural language and form), matching, discover with filters, negotiation room, approval, transactions, activity, settings and demo reset
- Deterministic engine with integer money, plus five agent modules with a typed message protocol and persisted runs
- Recalculation on withdrawal or join, with renewed approval required
- Rust contract with 16 unit tests covering unauthorised settlement, missing approvals, duplicate settlement, invalid proposal changes, cancellation and refund eligibility
- Wallet connection via NEAR Connect; server-side on-chain verification before any hash is shown
- 32 Vitest unit and integration tests; Playwright E2E tests for the main journey and mobile layouts

## What remains simulated or out of scope

- **Supplier offers** are fictional sample data, labelled everywhere. There are no live supplier integrations.
- **Demo personas** are fictional; in demo mode the connected wallet signs their on-chain approvals (labelled).
- **No fund custody:** "settlement" records the finalised deal; no tokens move. Refund eligibility is computed, but nothing is refunded.
- **Natural-language parsing** is rule-based (no LLM in this build).
- **Database** is SQLite (portable to Postgres/Supabase) with application-level authorization instead of RLS.
- **NEAR Intents** were evaluated, not integrated.

## Roadmap

1. NEP-141 stablecoin escrow: participants deposit into the pool and the contract pays the supplier on settlement or refunds on cancellation.
2. NEAR Intents for cross-chain contributions (pay with any asset; the supplier receives stablecoin).
3. Supplier onboarding with verification and signed, expiring offers.
4. An LLM (Claude) for request interpretation and explanations behind the existing schema validation, with the Guardian unchanged.
5. Per-participant wallets with function-call access keys so a participant's own agent can sign within limits they set.
6. Postgres/Supabase with RLS; multi-drop delivery routing.
