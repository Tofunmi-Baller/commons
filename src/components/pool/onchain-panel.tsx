"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Link2, Loader2, XCircle } from "lucide-react";
import { planOnchainAction, recordOnchainAction } from "@/app/actions";
import type { OnchainPlan } from "@/lib/services/onchain";
import { EXPLORER_TX } from "@/lib/near/config";
import { useWallet } from "@/components/near/wallet-provider";
import { Button, Card, CardHeader } from "@/components/ui";

const STEPS = [
  ["create_pool", "Create pool & register commitments"],
  ["set_proposal", "Anchor approved terms hash"],
  ["approve", "Participant approvals signed on-chain"],
  ["record_settlement", "Record settlement"],
] as const;

export function OnchainPanel({ poolId, isMember, isDemo }: { poolId: string; isMember: boolean; isDemo: boolean }) {
  const w = useWallet();
  const router = useRouter();
  const [plan, setPlan] = useState<OnchainPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const r = await planOnchainAction(poolId);
    if (r.ok) setPlan(r.data);
  }, [poolId]);

  useEffect(() => {
    if (!isMember) return;
    let cancelled = false;
    planOnchainAction(poolId).then((r) => {
      if (!cancelled && r.ok) setPlan(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [poolId, isMember, w.accountId]);

  if (!isMember) return null;
  const doneMethods = new Set(plan?.confirmed.map((t) => t.method_name));
  const stepIndex = plan ? (plan.step === "done" ? 4 : STEPS.findIndex(([m]) => m === plan.step)) : -1;

  async function execute() {
    if (!plan?.calls.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const hashes = await w.callContract(plan.calls.map((c) => ({ methodName: c.methodName, args: c.args })));
      const r = await recordOnchainAction(poolId, hashes);
      if (!r.ok) setMsg({ tone: "bad", text: r.error });
      else {
        const failed = r.data.filter((x) => !x.ok);
        setMsg(failed.length ? { tone: "bad", text: failed.map((f) => f.error).join("; ") } : { tone: "good", text: `Verified ${r.data.length} transaction(s) on NEAR testnet.` });
      }
      await refresh();
      router.refresh();
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "Transaction cancelled" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="bg-tangerine text-ink">
      <CardHeader
        title={<span className="flex items-center gap-2 text-ink"><Link2 className="size-5" /> Lock it on NEAR</span>}
        description={<span className="text-ink/70">The approved terms go into the COMMONS contract on NEAR testnet. The server verifies every transaction on-chain before showing it.</span>}
        action={<span className="rounded-full bg-ink px-2.5 py-1 text-[12px] text-tangerine">testnet</span>}
      />
      <div className="space-y-4 px-6 pb-6 pt-3">
        <ol className="space-y-2">
          {STEPS.map(([m, label], i) => {
            const done = doneMethods.has(m) && (m !== "approve" || stepIndex > 2);
            const active = i === stepIndex;
            return (
              <li key={m} className="flex items-center gap-3 text-sm">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold transition-colors duration-500 ${done ? "bg-ink text-tangerine" : active ? "bg-ink/20 text-ink" : "bg-ink/10 text-ink/50"}`}>
                  {done ? <CheckCircle2 className="size-3.5" /> : i + 1}
                </span>
                <span className={done || active ? "font-medium text-ink" : "text-ink/55"}>{label}</span>
              </li>
            );
          })}
        </ol>

        {plan?.blockedReason && <p className="rounded-2xl bg-ink/10 px-4 py-3 text-[13.5px] leading-relaxed text-ink/80">{plan.blockedReason}</p>}

        {plan && plan.calls.length > 0 && (
          <div className="space-y-2">
            {isDemo && plan.step === "approve" && (
              <p className="text-[12.5px] leading-relaxed text-ink/80">Demo mode: the three businesses are fictional and have no wallets, so your connected wallet signs each participant&apos;s on-chain approval. Each is still a separate transaction checked by the contract.</p>
            )}
            {w.status !== "connected" ? (
              <Button variant="dark" onClick={() => w.connect()} className="w-full">Connect NEAR wallet to continue</Button>
            ) : (
              <Button variant="dark" onClick={execute} disabled={busy} className="w-full">
                {busy && <Loader2 className="size-4 animate-spin" />}
                {plan.calls.length > 1 ? `Sign ${plan.calls.length} transactions: ${plan.calls[0].label.split(" ·")[0]}` : plan.calls[0].label}
              </Button>
            )}
          </div>
        )}

        {msg && (
          <p className={`flex items-start gap-2 text-[13px] ${msg.tone === "good" ? "text-ink" : "text-ink font-medium"}`}>
            {msg.tone === "good" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />} {msg.text}
          </p>
        )}

        {plan && plan.confirmed.length > 0 && (
          <ul className="space-y-1.5 rounded-2xl bg-ink/10 p-3">
            {plan.confirmed.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-ink/70">{t.method_name}</span>
                <a href={EXPLORER_TX(t.transaction_hash!)} target="_blank" rel="noreferrer" className="num inline-flex items-center gap-1 font-medium text-ink hover:underline">
                  {t.transaction_hash!.slice(0, 10)}… <ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
