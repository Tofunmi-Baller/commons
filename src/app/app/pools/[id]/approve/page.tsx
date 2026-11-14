import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { poolDetail } from "@/lib/services/views";
import { Amount } from "@/components/price";
import { Rise } from "@/components/motion";
import { NEAR_CONTRACT_ID, EXPLORER_ACCOUNT } from "@/lib/near/config";
import { Badge, Card, CardHeader, DemoTag, EmptyState, PageHeader } from "@/components/ui";
import { ProposalStatus, shortDate } from "@/components/status";
import { DecisionForm } from "@/components/pool/decision-form";

export default async function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const d = poolDetail(getDb(), user.id, id);
  if (!d) notFound();
  const { pool, current, me, myIntent } = d;
  const back = <Link href={`/app/pools/${pool.id}`} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-paper"><ArrowLeft className="size-3.5" /> Back to negotiation room</Link>;

  if (!me || !current || !myIntent) {
    return <div className="space-y-4">{back}<Card><EmptyState icon={<FileText className="size-4" />} title="Nothing to approve" body={!me ? "Only participants of this pool can approve its terms." : "There is no validated proposal for this pool yet."} /></Card></div>;
  }
  const mine = current.allocations.find((a) => a.isMe);
  const decision = current.approvals.find((a) => a.participant_id === me.id);
  const rows: [string, React.ReactNode][] = [
    ["Supplier", <span key="s">{current.offer?.supplier_name} <Badge tone="warn" className="ml-1">sample offer</Badge></span>],
    ["Your requested quantity", `${myIntent.quantity.toLocaleString()} units`],
    ["Your allocation", mine ? `${mine.allocated_quantity.toLocaleString()} units` : "Not included"],
    ["Your maximum price", <span key="m"><Amount cents={myIntent.max_unit_price} /> per unit, delivery included</span>],
    ["Final unit price", <Amount key="f" cents={current.unit_price} />],
    ["Your share of delivery", mine ? <Amount key="ds" cents={mine.delivery_share} /> : "—"],
    ["Your landed cost per unit", mine ? <Amount key="l" cents={Math.round(mine.contribution_amount / mine.allocated_quantity)} /> : "—"],
    ["You contribute", mine ? <strong key="c" className="font-display text-xl text-lime"><Amount cents={mine.contribution_amount} /></strong> : "—"],
    ["Savings vs buying alone", mine?.estimated_savings != null ? <span key="sv" className="text-lime"><Amount cents={mine.estimated_savings} /></span> : "No legitimate solo baseline"],
    ["Delivery arrangements", `One consolidated drop in ${pool.delivery_region} (${current.offer?.delivery_days ?? "?"} days lead time); delivery cost split by quantity. Your location: ${myIntent.delivery_location}.`],
    ["Settlement deadline", shortDate(pool.deadline)],
    ["Group total", <span key="g"><Amount cents={current.total_cost} /> for {current.total_quantity.toLocaleString()} units</span>],
  ];

  return (
    <Rise className="space-y-6">
      {back}
      <PageHeader
        eyebrow={<div className="flex gap-2"><ProposalStatus status={current.proposal_status} />{pool.is_demo ? <DemoTag /> : null}</div>}
        title={`Approve ${current.label}`}
        description={`${pool.product_name}. Review every term below. Approval is explicit and bound to this proposal's hash.`}
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Proposed deal" description="Calculated deterministically from the supplier offer and your intent." />
          <dl className="px-3 pb-4">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-5 gap-4 rounded-2xl px-3 py-3.5 text-[14.5px] odd:bg-white/[0.025]">
                <dt className="col-span-2 text-muted">{k}</dt>
                <dd className="num col-span-3">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <h3 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold tracking-tight"><ShieldCheck className="size-5 text-lime" /> Your decision</h3>
            {decision ? (
              <p className="text-sm text-muted">You <span className="text-paper">{decision.decision.replace("_", " ")}</span> this proposal on {new Date(decision.approved_at).toLocaleString("en-GB")}.</p>
            ) : !mine ? (
              <p className="text-sm text-muted">You have no allocation in this proposal.</p>
            ) : current.proposal_status !== "approved_by_guardian" ? (
              <p className="text-sm text-muted">This proposal is not open for decisions.</p>
            ) : (
              <DecisionForm proposalId={current.id} hash={current.proposal_hash} poolId={pool.id} contribution={mine.contribution_amount} />
            )}
          </Card>
          <Card className="bg-cream p-6 text-[13.5px] leading-relaxed text-ink/75">
            <h3 className="mb-2 font-display text-lg font-semibold text-ink">Refund and cancellation</h3>
            <ul className="list-disc space-y-1 pl-4">
              <li>If any participant rejects, or the deadline passes without full approval, the deal does not settle.</li>
              <li>If terms change for any reason, all approvals are cleared and renewed approval is required.</li>
              <li>A pool cancelled after you approved marks you refund-eligible in the contract (<code>is_refund_eligible</code>).</li>
              <li>Amounts are fixed in USD; NEAR figures use the live rate. COMMONS records commitments and does not hold funds in this MVP.</li>
            </ul>
          </Card>
          <Card className="p-6 text-[13.5px] text-muted">
            <h3 className="mb-2 font-display text-lg font-semibold text-paper">Contract</h3>
            <p>Network: NEAR testnet</p>
            <p>Contract: {NEAR_CONTRACT_ID ? <a className="text-lime hover:underline" href={EXPLORER_ACCOUNT(NEAR_CONTRACT_ID)} target="_blank" rel="noreferrer">{NEAR_CONTRACT_ID}</a> : "not deployed in this environment"}</p>
            <p>On-chain pool id: <span className="num">{pool.id}</span></p>
            <p className="num mt-1 break-all">Terms hash: {current.proposal_hash}</p>
          </Card>
        </div>
      </div>
    </Rise>
  );
}
