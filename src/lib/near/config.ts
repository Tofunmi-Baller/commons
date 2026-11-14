/** NEAR configuration. Testnet only — mainnet is deliberately unsupported. */
export const NEAR_NETWORK = "testnet" as const;
export const NEAR_CONTRACT_ID = process.env.NEXT_PUBLIC_COMMONS_CONTRACT_ID?.trim() || "commons-pool-26.testnet"; // deployed COMMONS contract on testnet
export const NEAR_RPC_URL = process.env.NEXT_PUBLIC_NEAR_RPC_URL?.trim() || "https://test.rpc.fastnear.com";
export const EXPLORER_TX = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
export const EXPLORER_ACCOUNT = (id: string) => `https://testnet.nearblocks.io/address/${id}`;
export const NEAR_GAS = "30000000000000"; // 30 Tgas
export const CONTRACT_METHODS = ["create_pool", "set_proposal", "approve", "record_settlement", "cancel_pool"] as const;
export type ContractMethod = (typeof CONTRACT_METHODS)[number];
