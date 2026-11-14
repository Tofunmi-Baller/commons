"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { NearConnector } from "@hot-labs/near-connect";
import { linkWalletAction } from "@/app/actions";
import { NEAR_CONTRACT_ID, NEAR_GAS, NEAR_NETWORK } from "@/lib/near/config";

export interface ContractCallRequest {
  methodName: string;
  args: Record<string, unknown>;
}

interface WalletState {
  accountId: string | null;
  status: "initialising" | "disconnected" | "connecting" | "connected" | "error";
  error: string | null;
  network: typeof NEAR_NETWORK;
  contractId: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Sign and send one transaction per call; resolves to transaction hashes. */
  callContract: (calls: ContractCallRequest[]) => Promise<string[]>;
}

const Ctx = createContext<WalletState | null>(null);

function hashOf(outcome: unknown): string {
  const o = outcome as { transaction_outcome?: { id?: string }; transaction?: { hash?: string } };
  const h = o?.transaction_outcome?.id ?? o?.transaction?.hash;
  if (!h) throw new Error("Wallet did not return a transaction hash");
  return h;
}

export function WalletProvider({ children, linkedAccount }: { children: ReactNode; linkedAccount: string | null }) {
  const connectorRef = useRef<NearConnector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletState["status"]>("initialising");
  const [error, setError] = useState<string | null>(null);

  const syncLink = useCallback(async (id: string | null) => {
    if (id !== linkedAccount) await linkWalletAction(id);
  }, [linkedAccount]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { NearConnector } = await import("@hot-labs/near-connect");
        const connector = new NearConnector({ network: NEAR_NETWORK, features: { testnet: true } });
        connectorRef.current = connector;
        connector.on("wallet:signIn", async (e) => {
          const id = e.accounts[0]?.accountId ?? null;
          setAccountId(id);
          setStatus(id ? "connected" : "disconnected");
          await syncLink(id);
        });
        connector.on("wallet:signOut", async () => {
          setAccountId(null);
          setStatus("disconnected");
          await syncLink(null);
        });
        try {
          const { accounts } = await connector.getConnectedWallet();
          if (!cancelled) {
            const id = accounts[0]?.accountId ?? null;
            setAccountId(id);
            setStatus(id ? "connected" : "disconnected");
            if (id) await syncLink(id);
          }
        } catch {
          if (!cancelled) setStatus("disconnected");
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e.message : "Wallet connector failed to load");
        }
      }
    })();
    return () => {
      cancelled = true;
      connectorRef.current?.removeAllListeners();
    };
  }, [syncLink]);

  const connect = useCallback(async () => {
    if (!connectorRef.current) return;
    setError(null);
    setStatus("connecting");
    try {
      await connectorRef.current.connect();
    } catch (e) {
      setStatus(accountId ? "connected" : "disconnected");
      setError(e instanceof Error ? e.message : "Connection cancelled");
    }
  }, [accountId]);

  const disconnect = useCallback(async () => {
    await connectorRef.current?.disconnect();
  }, []);

  const callContract = useCallback(async (calls: ContractCallRequest[]) => {
    if (!connectorRef.current || !accountId) throw new Error("Connect a NEAR wallet first");
    if (!NEAR_CONTRACT_ID) throw new Error("Contract not configured");
    const wallet = await connectorRef.current.wallet();
    const toTx = (c: ContractCallRequest) => ({
      receiverId: NEAR_CONTRACT_ID!,
      actions: [{ type: "FunctionCall" as const, params: { methodName: c.methodName, args: c.args, gas: NEAR_GAS, deposit: "0" } }],
    });
    if (calls.length === 1) return [hashOf(await wallet.signAndSendTransaction(toTx(calls[0])))];
    const outcomes = await wallet.signAndSendTransactions({ transactions: calls.map(toTx) });
    return outcomes.map(hashOf);
  }, [accountId]);

  return (
    <Ctx.Provider value={{ accountId, status, error, network: NEAR_NETWORK, contractId: NEAR_CONTRACT_ID, connect, disconnect, callContract }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used inside WalletProvider");
  return v;
}
