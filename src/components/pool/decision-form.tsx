"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, MessageSquareWarning, X } from "lucide-react";
import { decideAction } from "@/app/actions";
import { Button, inputClass } from "@/components/ui";
import { Amount } from "@/components/price";

export function DecisionForm({ proposalId, hash, poolId, contribution }: { proposalId: string; hash: string; poolId: string; contribution: number }) {
  const router = useRouter();
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (d: "approved" | "rejected" | "revision_requested") =>
    start(async () => {
      setError(null);
      const r = await decideAction(proposalId, d, hash, note || undefined);
      if (!r.ok) return setError(r.error);
      router.push(`/app/pools/${poolId}`);
      router.refresh();
    });
  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-ink p-4 text-[14px] leading-relaxed">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[#cbff4d]" />
        <span>I have reviewed these exact terms (hash <span className="num">{hash.slice(0, 12)}…</span>) and agree to contribute <strong><Amount cents={contribution} /></strong> if every participant approves and the deal settles before the deadline.</span>
      </label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional note (required context for a revision request)" className={inputClass} rows={2} />
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => submit("approved")} disabled={!ack || pending} size="lg">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve proposal
        </Button>
        <Button variant="secondary" onClick={() => submit("revision_requested")} disabled={pending || !note.trim()} size="lg" title={!note.trim() ? "Add a note describing the revision" : undefined}>
          <MessageSquareWarning className="size-4" /> Request revision
        </Button>
        <Button variant="danger" onClick={() => submit("rejected")} disabled={pending} size="lg"><X className="size-4" /> Reject</Button>
      </div>
      <p className="text-[12px] text-muted">Nothing is approved automatically. Your approval only counts for this exact hash; if the terms change, you will be asked again.</p>
    </div>
  );
}
