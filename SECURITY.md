# Security model

## Agent permissions

| Agent | Can | Cannot |
|---|---|---|
| Demand Intelligence | parse text, propose structured fields, match intents | save without user review, invent missing values |
| Supplier Intelligence | read offers, rank them | mark offers verified, alter prices |
| Negotiation | create draft proposals | approve, spend, sign or move funds |
| Financial Guardian | approve or reject proposals by deterministic rules | be overridden by any other agent |
| Coordination | sequence agents, change proposal status, request approvals | approve on behalf of a participant |

No agent has any access to wallets or to contract calls. On-chain actions are signed only by the user's wallet in the browser.

## Approval requirements

- No automatic approvals. The Approve button stays disabled until the user ticks an acknowledgement that names the exact contribution and hash.
- An approval is bound to `proposal_hash`; the server rejects a decision whose reviewed hash differs from the current one.
- Withdrawals and new participants trigger recalculation. New terms get a new hash and need fresh approvals. Commitments are never changed silently.

## Financial safeguards

- All money is integer US cents (NEAR shown at a live display rate); delivery splits use exact integer largest-remainder allocation.
- Budgets are compared on landed cost (goods plus delivery share).
- The Guardian independently recomputes every figure; AI or agent output is treated as an untrusted proposal.
- Savings are shown only against a real baseline (the participant's best solo option from the same catalogue).
- Sample supplier offers are labelled everywhere and flagged as unverified.
- Each participant's maximum price is private: other participants see only pass/fail, never the number.

## Blockchain

- Testnet only. No private keys are requested or stored; signing happens in the user's wallet via NEAR Connect.
- The server decides contract arguments. The browser cannot alter the terms it asks the wallet to sign without failing verification (pool id, hash and totals are checked by the contract against stored state).
- Every hash is verified on-chain (signer, receiver, method, pool, success) before it is recorded. Duplicate hashes are rejected (UNIQUE constraint).
- Contract: organizer-only terms and settlement, participant-signed approvals, hash matching, terms locked after full approval, no double settlement, deadline enforcement, explicit cancellation and refund eligibility, checked `u128` arithmetic, input validation on every call.

## Web application

- Sessions: random 256-bit tokens stored as SHA-256 hashes; httpOnly, SameSite=Lax cookies, Secure in production; 7-day expiry.
- Passwords: scrypt with a per-user salt; constant-time comparison.
- All mutations are server actions with zod validation and membership/ownership checks.
- Errors shown to users are whitelisted messages; internal errors are logged without payloads or secrets.
- An audit log records intents, joins, withdrawals, decisions, proposal readiness, wallet linking and on-chain records.

## Known gaps (MVP)

- The contract does not custody funds, so refunds are eligibility flags only.
- In demo mode the connected wallet signs for the fictional personas (labelled in the UI).
- No rate limiting or CSRF tokens beyond Next.js server-action origin checks.
