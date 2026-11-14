/**
 * Minimal server-side NEAR JSON-RPC client (testnet). Used to verify that a
 * transaction hash submitted by the browser really exists on-chain, targets our
 * contract, was signed by the user's linked account and succeeded — so the app
 * never displays an unverified hash as a real transaction.
 */
import { NEAR_CONTRACT_ID, NEAR_RPC_URL, CONTRACT_METHODS, type ContractMethod } from "./config";

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(NEAR_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "commons", method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`NEAR RPC HTTP ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message?: string; data?: unknown; cause?: { name?: string } } };
  if (body.error) throw new Error(`NEAR RPC error: ${body.error.cause?.name ?? body.error.message ?? "unknown"}`);
  return body.result as T;
}

export async function viewContract<T>(methodName: string, args: Record<string, unknown>): Promise<T> {
  if (!NEAR_CONTRACT_ID) throw new Error("Contract not configured");
  const result = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: NEAR_CONTRACT_ID,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(result.result).toString("utf8")) as T;
}

interface TxOutcome {
  status: { SuccessValue?: string; Failure?: unknown } | string;
  transaction: { hash: string; signer_id: string; receiver_id: string; actions: ({ FunctionCall?: { method_name: string; args: string } } | string)[] };
  receipts_outcome: { outcome: { logs: string[]; status: { Failure?: unknown } | Record<string, unknown> } }[];
}

export interface VerifiedTx {
  hash: string;
  signer: string;
  method: ContractMethod;
  args: Record<string, unknown>;
  succeeded: boolean;
  failure: string | null;
  events: { event: string; data: Record<string, unknown>[] }[];
}

export async function verifyTransaction(hash: string, expectedSigner: string): Promise<VerifiedTx> {
  if (!NEAR_CONTRACT_ID) throw new Error("Contract not configured");
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(hash)) throw new Error("Not a valid NEAR transaction hash");
  const out = await rpc<TxOutcome>("tx", { tx_hash: hash, sender_account_id: expectedSigner, wait_until: "EXECUTED_OPTIMISTIC" });
  const t = out.transaction;
  if (t.signer_id !== expectedSigner) throw new Error("Transaction was not signed by your linked wallet");
  if (t.receiver_id !== NEAR_CONTRACT_ID) throw new Error("Transaction does not target the COMMONS contract");
  const call = t.actions.find((a): a is { FunctionCall: { method_name: string; args: string } } => typeof a === "object" && !!a.FunctionCall);
  if (!call || !(CONTRACT_METHODS as readonly string[]).includes(call.FunctionCall.method_name)) throw new Error("Transaction is not a COMMONS contract call");
  const failedReceipt = out.receipts_outcome.find((r) => "Failure" in r.outcome.status);
  const topFailure = typeof out.status === "object" && out.status.Failure;
  const failure = topFailure || failedReceipt ? JSON.stringify(topFailure || (failedReceipt!.outcome.status as { Failure: unknown }).Failure).slice(0, 300) : null;
  const events = out.receipts_outcome
    .flatMap((r) => r.outcome.logs)
    .filter((l) => l.startsWith("EVENT_JSON:"))
    .map((l) => JSON.parse(l.slice("EVENT_JSON:".length)) as { event: string; data: Record<string, unknown>[] });
  return {
    hash: t.hash,
    signer: t.signer_id,
    method: call.FunctionCall.method_name as ContractMethod,
    args: JSON.parse(Buffer.from(call.FunctionCall.args, "base64").toString("utf8")) as Record<string, unknown>,
    succeeded: !failure,
    failure,
    events,
  };
}
