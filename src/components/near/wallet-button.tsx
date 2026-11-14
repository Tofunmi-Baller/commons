"use client";

import { Loader2, LogOut, Wallet } from "lucide-react";
import { Button } from "@/components/ui";
import { EXPLORER_ACCOUNT } from "@/lib/near/config";
import { useWallet } from "./wallet-provider";

export function WalletButton() {
  const w = useWallet();
  if (w.status === "connected" && w.accountId) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-panel pl-3.5">
        <span className="size-2 rounded-full bg-lime" aria-hidden />
        <a href={EXPLORER_ACCOUNT(w.accountId)} target="_blank" rel="noreferrer" className="max-w-24 truncate sm:max-w-36 text-[13px] text-paper hover:text-mint" title={`${w.accountId} · NEAR ${w.network}`}>
          {w.accountId}
        </a>
        <span className="hidden rounded bg-line px-1.5 sm:inline py-0.5 text-[10px] uppercase tracking-wide text-muted">{w.network}</span>
        <Button variant="ghost" size="sm" onClick={() => w.disconnect()} aria-label="Disconnect wallet"><LogOut className="size-3.5" /></Button>
      </div>
    );
  }
  return (
    <Button variant="secondary" size="sm" onClick={() => w.connect()} disabled={w.status === "initialising" || w.status === "connecting"} title={w.error ?? undefined}>
      {w.status === "connecting" || w.status === "initialising" ? <Loader2 className="size-3.5 animate-spin" /> : <Wallet className="size-3.5" />}
      <span className="hidden sm:inline">{w.status === "initialising" ? "Loading wallet" : "Connect NEAR wallet"}</span><span className="sm:hidden">Wallet</span>
    </Button>
  );
}
