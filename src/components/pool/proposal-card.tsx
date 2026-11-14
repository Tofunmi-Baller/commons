import { Check, ShieldAlert, ShieldCheck, X } from "lucide-react";
import type { PoolDetail } from "@/lib/services/views";
import { formatBps, basisPoints } from "@/lib/engine/money";
import { Amount } from "@/components/price";
import { ProposalStatus } from "@/components/status";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

type P = PoolDetail["proposals"][number];

export function ProposalCard({ p, highlight }: { p: P; highlight?: boolean }) {
  const rejected = p.proposal_status === "rejected_by_guardian";
  return (
    <div className={cn("relative overflow-hidden rounded-[26px]", highlight ? "bg-lime text-ink" : "bg-panel")}>
      {rejected && <span aria-hidden className="pointer-events-none absolute right-5 top-6 rotate-[-8deg] rounded-xl bg-tangerine px-5 py-1.5 font-display text-lg font-bold uppercase tracking-wide text-ink">Rejected</span>}
      <div className={cn("flex flex-wrap items-start justify-between gap-4 px-6 pb-4 pt-6 sm:px-7", rejected && "pr-40")}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-[26px] font-semibold leading-none tracking-[-0.03em]">{p.label}</h4>
            {!rejected && <ProposalStatus status={p.proposal_status} />}
          </div>
          <p className={cn("mt-2 text-[14px]", highlight ? "text-ink/70" : "text-muted")}>
            {p.offer?.supplier_name ?? p.supplier_offer_id} · {p.strategy === "headline_price" ? "lowest sticker price" : "constraint-optimised search"} · <span className={highlight ? "text-ink" : "text-amber"}>sample offer</span>
          </p>
        </div>
        {!rejected && (
          <div className="text-right">
            <p className="font-display text-[26px] font-semibold leading-none tracking-[-0.03em]"><Amount cents={p.total_cost} stack className="items-end" /></p>
            <p className={cn("mt-1 text-[12.5px]", highlight ? "text-ink/65" : "text-muted")}>group total</p>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-4 sm:px-5">
        {[
          ["Quantity", `${p.total_quantity.toLocaleString()} units`],
          ["Unit price", <Amount key="u" cents={p.unit_price} stack />],
          ["Delivery", <Amount key="d" cents={p.delivery_cost} stack />],
          ["Savings", p.total_savings !== null ? <Amount key="s" cents={p.total_savings} stack /> : "None"],
        ].map(([k, v]) => (
          <div key={String(k)} className={cn("rounded-2xl px-4 py-3", highlight ? "bg-ink/[0.07]" : "bg-white/[0.04]")}>
            <dt className={cn("text-[12.5px]", highlight ? "text-ink/65" : "text-muted")}>{k}</dt>
            <dd className="num mt-1 text-[15px] font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto px-6 py-5 sm:px-7">
        <table className="w-full min-w-[560px] text-[14px]">
          <thead>
            <tr className={cn("text-left text-[12.5px]", highlight ? "text-ink/60" : "text-muted")}>
              <th className="pb-2 font-normal">Business</th>
              <th className="pb-2 text-right font-normal">Qty</th>
              <th className="pb-2 text-right font-normal">Pays</th>
              <th className="pb-2 text-right font-normal">Per unit, landed</th>
              <th className="pb-2 text-right font-normal">Saves</th>
              <th className="pb-2 text-right font-normal">Limit</th>
            </tr>
          </thead>
          <tbody className="num">
            {p.allocations.map((a) => (
              <tr key={a.id} className={cn(!a.within_budget && !highlight && "text-tangerine")}>
                <td className="py-2">{a.label}{a.isMe && <span className={cn("ml-1.5 rounded-full px-2 py-0.5 text-[11.5px]", highlight ? "bg-ink text-lime" : "bg-lime/15 text-lime")}>you</span>}</td>
                <td className="py-2 text-right">{a.allocated_quantity.toLocaleString()}</td>
                <td className="py-2 text-right"><Amount cents={a.contribution_amount} stack className="items-end" /></td>
                <td className="py-2 text-right"><Amount cents={Math.round(a.contribution_amount / a.allocated_quantity)} stack className="items-end" /></td>
                <td className="py-2 text-right">
                  {a.estimated_savings !== null && a.baseline_cost ? <span className="inline-flex flex-col items-end"><Amount cents={a.estimated_savings} /><span className="text-[12px] opacity-70">{formatBps(basisPoints(a.estimated_savings, a.baseline_cost))}</span></span> : <span className="opacity-60">no baseline</span>}
                </td>
                <td className="py-2 text-right">
                  <span className={cn("ml-auto grid size-6 place-items-center rounded-full", a.within_budget ? (highlight ? "bg-ink text-lime" : "bg-lime text-ink") : "bg-tangerine text-ink")}>
                    {a.within_budget ? <Check className="size-3.5" aria-label="within limit" /> : <X className="size-3.5" aria-label="over limit" />}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={cn("px-6 pb-6 text-[14px] sm:px-7", highlight ? "text-ink/80" : "text-paper/75")}>
        <p className="leading-relaxed">{p.rationale}</p>
        {p.guardian && (
          <details className="group mt-4">
            <summary className={cn("flex cursor-pointer list-none items-center gap-2 rounded-full px-4 py-2 font-medium transition w-fit", highlight ? "bg-ink text-lime" : p.guardian.approved ? "bg-lime/15 text-lime" : "bg-tangerine/15 text-tangerine")}>
              {p.guardian.approved ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
              Financial Guardian: {p.guardian.checks.filter((c) => c.passed).length} of {p.guardian.checks.length} checks passed
            </summary>
            <ul className="mt-3 space-y-1.5">
              {p.guardian.checks.map((c) => (
                <li key={c.name} className="flex gap-2">
                  {c.passed ? <Check className="mt-0.5 size-4 shrink-0" /> : <X className="mt-0.5 size-4 shrink-0 text-tangerine" />}
                  <span><span className="font-medium">{c.name}.</span> <span className="opacity-75">{c.detail}</span></span>
                </li>
              ))}
              {p.guardian.warnings.map((w) => (
                <li key={w.message} className="flex gap-2"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber" /> <span className="opacity-80">{w.message}</span></li>
              ))}
            </ul>
          </details>
        )}
        <p className="num mt-4 break-all text-[11.5px] opacity-55">Terms fingerprint {p.proposal_hash}</p>
        {rejected && <Badge tone="bad" className="mt-3">Rejected by Financial Guardian</Badge>}
      </div>
    </div>
  );
}
