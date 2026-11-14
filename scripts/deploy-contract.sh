#!/usr/bin/env bash
# Build, test and deploy the COMMONS contract to NEAR testnet.
# Requires: rustup (with wasm32-unknown-unknown), cargo-near, near-cli-rs.
# Usage: CONTRACT_ID=commons-yourname.testnet ./scripts/deploy-contract.sh
set -euo pipefail
: "${CONTRACT_ID:?Set CONTRACT_ID, e.g. commons-yourname.testnet}"
cd "$(dirname "$0")/../contract"

cargo test
cargo near build non-reproducible-wasm

# Create and fund the account from the testnet faucet (skipped if it already exists).
near create-account "$CONTRACT_ID" --useFaucet --networkId testnet || echo "Account exists or faucet unavailable; continuing with deploy."

near contract deploy "$CONTRACT_ID" use-file ./target/near/commons_pool.wasm \
  with-init-call new json-args '{}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  network-config testnet sign-with-keychain send

echo
echo "Deployed. Add to .env.local:"
echo "NEXT_PUBLIC_COMMONS_CONTRACT_ID=$CONTRACT_ID"
