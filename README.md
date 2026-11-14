# COMMONS

**Collective buying. Intelligent coordination. Programmable money.**

COMMONS is an AI-agent purchasing network that turns fragmented small-business demand into collective buying power. Agents match compatible buyers, compare supplier offers, and negotiate a deal within every buyer's limits. A deterministic Financial Guardian rejects any deal that breaks a constraint. Every participant explicitly approves the exact terms, and the commitment is anchored in a NEAR smart contract.

Built for the NEAR Hackathon 2026 (tracks: Agent Economy, Real-World Money, AI Swarms).

---

## The problem

Small businesses pay more because they buy alone. They face wholesale minimum order quantities, weak negotiating power and no way to find buyers with matching needs. Pooling money with strangers is hard to coordinate, hard to trust, and opaque about how the group reached its decision.

## The solution

1. **Submit demand.** Describe a need in plain language or a form: quantity, maximum landed unit price, location and deadline.
2. **Demand Compiler.** Finds combinations of buyers and supplier offers that are economically and operationally viable. It never pools buyers just because their products look similar.
3. **Multi-agent negotiation.** Five agents with separate jobs produce a transparent, inspectable proposal.
4. **Financial Guardian.** Recomputes every figure deterministically and rejects proposals that break a budget, minimum order, stock limit, region or deadline.
5. **Explicit approval.** Each participant approves terms bound to a SHA-256 hash. If the terms change, earlier approvals are void.
6. **NEAR commitment.** The pool, each participant's committed maximum, the terms hash, each participant's signed approval and the settlement are recorded and enforced by a Rust contract on testnet.

## Money and the demo world

- Deals are priced in **US dollars** (integer cents) because suppliers quote in fiat. Every amount in the UI is shown **in NEAR at the live CoinGecko rate, with USD in brackets**, refreshed every 60 s. If the rate can't be fetched, the UI shows USD only.
- The seeded demo network is fictional: 13 businesses across New York, Berlin, London, Singapore and Toronto, 7 pools, 11 sample supplier offers. Every pool, negotiation, agent run and approval in it was produced by calling the real services at seed time; no records are hand-written and no on-chain hashes are invented.

## Features (implemented)

| Area | What works |
|---|---|
| Landing page | Product story. The example deal is computed live by the engine from labelled sample data. |
| Auth | Email and password accounts (scrypt hashes, httpOnly server sessions), plus one-click fictional demo personas |
| Dashboard | Active pools, pooled demand, collective savings, pending approvals, recent agent runs, opportunities, deadlines, and a chart of your cost alone vs together. All figures come from database state; empty states otherwise. |
| Create demand | Natural-language extraction (rule-based, shows its evidence, asks for missing fields), editable guided form, server validation, matching with compatible/incompatible reasons, join or start a pool |
| Discover pools | Cards with demand, participants, target, negotiated price, average savings, deadline and status. Filters: category, location, price, progress, deadline. |
| Negotiation room | Stage tracker, proposal comparison (allocations, landed cost, budget check, savings, Guardian checks, terms hash), participants, labelled sample offers, persisted agent timeline, NEAR panel |
| Approval | Full term sheet, refund and cancellation conditions, contract info. Approve, reject or request revision. Approval requires an explicit acknowledgement and is hash-bound. |
| Transactions | Off-chain approval records (no hash, labelled) and verified NEAR testnet transactions with explorer links |
| Recalculation | Withdrawals and new joiners trigger a new round; old approvals never carry over to changed terms |
| Demo reset | Settings → Reset demo, or `pnpm demo:reset` |

## Architecture

```
src/lib/engine/     Deterministic core: money (integer US cents), Demand Compiler, Guardian rules, proposal hashing
src/lib/agents/     Five agents emitting typed AgentMessages (Demand, Supplier, Negotiation, Guardian, Coordination types)
src/lib/services/   Coordination pipeline, pool lifecycle, approvals, on-chain planning and verification
src/lib/db/         Schema, connection, repository with per-user authorization
src/lib/near/       Testnet config and server-side JSON-RPC verification
src/components/     UI kit, shell, pool screens, wallet provider (@hot-labs/near-connect)
contract/           Rust NEAR contract (near-sdk 5.30) with unit tests
tests/              Vitest unit and integration tests
e2e/                Playwright end-to-end journeys (desktop and mobile)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

## Technology

Next.js 16 (App Router, server actions) · TypeScript strict · Tailwind CSS 4 · Lucide · Recharts · Zod · SQLite via Node 24's built-in `node:sqlite` · Rust + near-sdk 5.30 · `@hot-labs/near-connect` (the wallet connector recommended by current NEAR docs; `near-wallet-selector` is deprecated) · Vitest · Playwright

### Deviations from the original spec (and why)

- **SQLite instead of Supabase/Postgres.** This lets judges run the app with zero setup. The schema is relational with foreign keys, CHECK constraints and indexes. Because SQLite has no row-level security, authorization is enforced in the repository and service layer (`requireActiveMember`, `intentForUser`, and so on) and covered by tests. The schema ports directly to Postgres.
- **No LLM in this build.** The Demand Intelligence agent uses a transparent rule-based parser. It shows the text it matched and asks for missing fields rather than guessing. Every financial figure is deterministic by design, so no capability depends on a model.
- **shadcn-style components are hand-written** (`src/components/ui`) instead of generated by the shadcn CLI.

## NEAR integration

**Deployed on testnet:** [`commons-pool-26.testnet`](https://testnet.nearblocks.io/address/commons-pool-26.testnet) (16/16 contract unit tests pass; built with cargo-near 0.23, near-sdk 5.30). The app uses this contract by default.


- **Contract** (`contract/src/lib.rs`): `create_pool`, `set_proposal`, `approve`, `record_settlement`, `cancel_pool`, and the views `get_pool`, `settlement_blockers`, `is_settlement_ready`, `is_refund_eligible`. It emits NEP-297-style `EVENT_JSON` logs.
- **Rules enforced on-chain:** only the organizer sets terms or settles; each approval is signed by the participant's own account and matches the current hash; replacing terms clears approvals with an explicit `proposal_replaced` event; terms lock once everyone has approved; no settlement without full approval; no double settlement; no settlement after the deadline; cancellation and refund eligibility are explicit; amounts are `u128` in US cents with checked addition.
- **App flow:** the server computes the exact arguments for each step, your wallet signs, and the server fetches the transaction from testnet RPC. It checks the signer, the receiver (our contract), the method, the pool and success before recording it. Unverified hashes are never displayed.
- **Demo mode:** the three fictional businesses have no wallets, so the connected wallet is registered as the signer for their participant slots. Each approval is still a separate transaction checked by the contract. This is labelled in the UI.
- **Scope:** the contract records commitments and does **not** hold funds. See [SUBMISSION.md](SUBMISSION.md).
- **NEAR Intents:** investigated as an optional cross-chain payment rail for settlement (a buyer pays in any asset and the supplier receives a stablecoin). It is not implemented; a working contract came first.

## Setup

Requirements: Node ≥ 22.13 (Node 24 recommended; uses `node:sqlite`) and pnpm 9.

```bash
pnpm install
cp .env.example .env.local      # optional: the deployed testnet contract is used by default
pnpm dev                         # http://localhost:3000
```

The database is created and seeded automatically on first request.

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_COMMONS_CONTRACT_ID` | Testnet account hosting the contract. Defaults to `commons-pool-26.testnet`; set it to use your own deployment. |
| `NEXT_PUBLIC_NEAR_RPC_URL` | Testnet RPC (default `https://test.rpc.fastnear.com`) |
| `COMMONS_DB_PATH` | SQLite path (default `./data/commons.db`; `/tmp/commons.db` on Vercel) |

No secret keys are needed. The app never asks for or stores private keys.

### Deploy the contract (testnet)

```bash
# one-time toolchain (official installers from docs.near.org)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/cargo-near/releases/latest/download/cargo-near-installer.sh | sh

CONTRACT_ID=commons-<you>.testnet ./scripts/deploy-contract.sh
```

Then set `NEXT_PUBLIC_COMMONS_CONTRACT_ID` to your account and restart (only needed to use your own deployment).

## Demo

See [DEMO_SCRIPT.md](DEMO_SCRIPT.md). Short version: Sign in → **Bloom Bakery** → Discover Pools → cartons pool → **Run agent negotiation**. Proposal A is rejected for Participant B's budget and Proposal B is approved. Then approve as each of the three personas (switch personas in the header), connect a testnet wallet, and sign the four contract steps. Reset any time in Settings.

## Testing

```bash
pnpm test            # 33 unit + integration tests (engine, agents, services)
pnpm test:e2e        # Playwright: full journey + mobile layouts (starts its own server on :3200)
pnpm test:contract   # 16 Rust contract unit tests (needs Rust toolchain)
pnpm typecheck && pnpm lint && pnpm build
```

## Known limitations

- No custody of funds: settlement records that the agreed deal was finalised; no tokens move.
- Supplier offers are sample data. There are no live supplier integrations.
- Demand parsing is rule-based with a fixed product catalogue and a fixed list of supported cities (New York, Berlin, London, Singapore, Toronto, Lisbon).
- SQLite on Vercel is ephemeral (per-instance `/tmp`). Use local or self-hosted deployment for persistent demos.
- On-chain steps require a funded testnet wallet supported by NEAR Connect.
- Agents run sequentially in one process (allowed by the spec for the MVP); each is a separate, separately tested module.
