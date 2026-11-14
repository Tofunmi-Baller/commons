"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Play, LogOut, UserPlus } from "lucide-react";
import { joinPoolAction, negotiateAction, withdrawAction } from "@/app/actions";
import { Button, ButtonLink } from "@/components/ui";

export function NegotiateButton({ poolId, hasProposal }: { poolId: string; hasProposal: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await negotiateAction(poolId);
            if (!r.ok) setError(r.error);
            router.refresh();
          })
        }
        disabled={pending}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        {hasProposal ? "Re-run negotiation" : "Run agent negotiation"}
      </Button>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

export function WithdrawButton({ poolId }: { poolId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!confirm) return <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}><LogOut className="size-3.5" /> Withdraw</Button>;
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="text-muted">Withdraw? The group will be recalculated.</span>
      <Button variant="danger" size="sm" disabled={pending} onClick={() => start(async () => { const r = await withdrawAction(poolId); if (!r.ok) setError(r.error); setConfirm(false); router.refresh(); })}>Confirm</Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>Cancel</Button>
      {error && <span className="text-danger">{error}</span>}
    </div>
  );
}

export function JoinPool({ poolId, intents }: { poolId: string; intents: { id: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!intents.length) return <ButtonLink href="/app/demand/new"><UserPlus className="size-4" /> Create matching demand to join</ButtonLink>;
  return (
    <div className="flex flex-col items-end gap-2">
      {intents.map((i) => (
        <Button key={i.id} disabled={pending} onClick={() => start(async () => { const r = await joinPoolAction(poolId, i.id); if (!r.ok) setError(r.error); router.refresh(); })}>
          <UserPlus className="size-4" /> Join with: {i.label}
        </Button>
      ))}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}
