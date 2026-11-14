import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, Clock, MapPin, Package, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { intentsForUser } from "@/lib/db/repo";
import { poolDetail } from "@/lib/services/views";
import { formatUSD } from "@/lib/engine/money";
import type { PriceTier } from "@/lib/engine/types";
import type { AgentType } from "@/lib/agents/types";
import { Badge, ButtonLink, Card, CardHeader, DemoTag, EmptyState, PageHeader } from "@/components/ui";
import { AGENT_META, PoolStatus, shortDate } from "@/components/status";
import { AgentTimeline } from "@/components/pool/agent-timeline";
import { ProposalCard } from "@/components/pool/proposal-card";
import { JoinPool, NegotiateButton, WithdrawButton } from "@/components/pool/pool-actions";
import { OnchainPanel } from "@/components/pool/onchain-panel";
import { Amount } from "@/components/price";
import { Fill, Item, Rise, Stagger } from "@/components/motion";

const STAGES: AgentType[] = ["demand_intelligence", "supplier_intelligence", "negotiation", "financial_guardian", "coordination"];

export default async function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = getDb();
  const d = poolDetail(db, user.id, id);
  if (!d) notFound();
  const { pool, me, current } = d;

  const negotiationGroup = [...d.runs].reverse().find((r) => r.agent_type === "negotiation")?.run_group;
  const stageDone = (a: AgentType) =>
    a === "coordination" ? d.approval?.complete ?? false : d.runs.some((r) => r.run_group === negotiationGroup && r.agent_type === a && r.status === "succeeded");
  const active = d.participants.filter((p) => p.status === "active");
  const totalDemand = active.reduce((s, p) => s + p.quantity, 0);
  const roundStart = d.runs.find((r) => r.run_group === negotiationGroup)?.created_at ?? "";
  const roundProposals = negotiationGroup ? d.proposals.filter((p) => p.created_at >= roundStart) : [];
  const shownProposals = roundProposals.length ? roundProposals : d.proposals.slice(-2);
  const openIntents = me ? [] : intentsForUser(db, user.id).filter((i) => i.status === "open" && i.product_key === pool.product_key && i.delivery_region === pool.delivery_region);
  const myDecision = current && me ? current.approvals.find((a) => a.participant_id === me.id) : undefined;
  const editable = !["committed", "settled", "cancelled"].includes(pool.status);
  const mine = current?.allocations.find((a) => a.isMe);

  const stats: { k: string; v: React.ReactNode; hot?: boolean }[] = [
    { k: "Total demand", v: `${totalDemand.toLocaleString()} units` },
    { k: "Target", v: `${pool.target_quantity.toLocaleString()} units` },
    { k: "Unit price", v: current ? <Amount cents={current.unit_price} stack usdClassName="text-muted" /> : "Not yet" },
    { k: "Group savings", v: current?.total_savings != null ? <Amount cents={current.total_savings} stack usdClassName="text-ink/60" /> : "Not yet", hot: current?.total_savings != null },
  ];

  return (
    <div className="space-y-8">
      <Rise>
        <PageHeader
          eyebrow={<div className="flex flex-wrap items-center gap-2"><PoolStatus status={pool.status} />{pool.is_demo ? <DemoTag /> : null}<Badge>{pool.category}</Badge></div>}
          title={pool.product_name.split(" (")[0]}
          description={
            <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span>{pool.product_name.match(/\((.*)\)/)?.[1]}</span>
              <span className="flex items-center gap-1.5"><MapPin className="size-4" /> {pool.delivery_region}</span>
              <span className="flex items-center gap-1.5"><Clock className="size-4" /> Settles by {shortDate(pool.deadline)}</span>
              <span className="flex items-center gap-1.5"><Users className="size-4" /> {active.length} businesses</span>
            </span>
          }
          actions={
            me ? (
              <div className="flex flex-col items-start gap-2 lg:items-end">
                {editable && <NegotiateButton poolId={pool.id} hasProposal={!!current} />}
                {current?.proposal_status === "approved_by_guardian" && !myDecision && (
                  <ButtonLink href={`/app/pools/${pool.id}/approve`} variant="secondary">Review and approve <ArrowRight className="size-4" /></ButtonLink>
                )}
                {editable && <WithdrawButton poolId={pool.id} />}
              </div>
            ) : editable ? (
              <JoinPool poolId={pool.id} intents={openIntents.map((i) => ({ id: i.id, label: `${i.quantity} units · max ${formatUSD(i.max_unit_price)}` }))} />
            ) : null
          }
        />
      </Rise>

      <Rise delay={0.1}>
        <ol className="grid grid-cols-5 gap-2 rounded-[26px] bg-panel p-2.5 sm:p-3">
          {STAGES.map((a, i) => {
            const meta = AGENT_META[a];
            const done = stageDone(a);
            const Icon = meta.icon;
            return (
              <li key={a} className={`flex flex-col items-center gap-2 rounded-[18px] px-1 py-4 text-center transition-colors duration-700 sm:flex-row sm:gap-3 sm:px-4 sm:text-left ${done ? "bg-lime text-ink" : "bg-white/[0.03] text-muted"}`} style={{ transitionDelay: `${i * 120}ms` }}>
                <span className={`grid size-9 shrink-0 place-items-center rounded-full ${done ? "bg-ink text-lime" : "bg-white/[0.06]"}`}>{done ? <Check className="size-4" /> : <Icon className="size-4" />}</span>
                <span className="text-[11.5px] font-medium leading-tight sm:text-[13.5px]">{meta.stage}</span>
              </li>
            );
          })}
        </ol>
      </Rise>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Stagger onMount className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(({ k, v, hot }) => (
              <Item key={k}>
                <div className={`h-full rounded-[22px] p-5 ${hot ? "bg-lime text-ink" : "bg-panel"}`}>
                  <p className={`text-[13px] ${hot ? "text-ink/70" : "text-muted"}`}>{k}</p>
                  <div className="num mt-2 font-display text-[22px] font-semibold leading-tight tracking-tight">{v}</div>
                </div>
              </Item>
            ))}
          </Stagger>
          <Fill value={totalDemand} max={pool.target_quantity} />

          <section>
            <h2 className="font-display text-[28px] font-semibold tracking-[-0.03em]">Proposals, side by side</h2>
            <p className="mb-4 mt-1 text-[14px] text-muted">The exact terms each proposal would bind every business to, checked by fixed rules.</p>
            {shownProposals.length ? (
              <div className="space-y-4">
                {[...shownProposals].reverse().map((p, i) => (
                  <Rise key={p.id} delay={0.15 + i * 0.12}><ProposalCard p={p} highlight={p.id === current?.id} /></Rise>
                ))}
              </div>
            ) : (
              <div className="rounded-[26px] bg-sky text-ink">
                <EmptyState
                  icon={<Package className="size-5" />}
                  title="Ready to negotiate"
                  body={me ? `${active.length} businesses and ${d.offers.length} supplier offers are lined up. Run the agents to compile a deal.` : "The businesses in this pool have not started a negotiation round yet."}
                />
              </div>
            )}
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Businesses" description="Shown by label; everyone's limit stays private." />
              <ul className="space-y-1 px-3 pb-4">
                {d.participants.map((p) => {
                  const appr = current?.approvals.find((a) => a.participant_id === p.id);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 rounded-2xl px-3 py-3 text-sm transition hover:bg-white/[0.03]">
                      <div>
                        <p className={p.status !== "active" ? "text-muted line-through" : "font-medium"}>{p.label}{p.isMe && <span className="ml-1.5 rounded-full bg-lime/15 px-2 py-0.5 text-[11.5px] text-lime">you</span>}</p>
                        <p className="num text-[12.5px] text-muted">{p.quantity.toLocaleString()} units · {p.location.split(",")[0]}</p>
                      </div>
                      {p.status !== "active" ? <Badge>{p.status}</Badge> : appr ? <Badge tone={appr.decision === "approved" ? "good" : "bad"}>{appr.decision.replace("_", " ")}</Badge> : current ? <Badge tone="warn">waiting</Badge> : null}
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card>
              <CardHeader title="Supplier offers" description="Sample data, not live suppliers." />
              <ul className="space-y-2 px-3 pb-4">
                {d.offers.map((o) => {
                  const tiers = JSON.parse(o.price_tiers) as PriceTier[];
                  return (
                    <li key={o.id} className="rounded-2xl bg-white/[0.03] px-4 py-3.5 text-[13.5px]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-display text-[16px] font-semibold tracking-tight">{o.supplier_name}</p>
                        <Badge tone="warn">sample</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tiers.map((t) => (
                          <span key={t.minQuantity} className="num rounded-full bg-white/[0.06] px-2.5 py-1 text-[12.5px]">{t.minQuantity.toLocaleString()}+ · <Amount cents={t.unitPrice} usdClassName="text-muted" /></span>
                        ))}
                      </div>
                      <p className="num mt-2 text-[12.5px] text-muted">Min order {o.minimum_order_quantity.toLocaleString()} · delivery <Amount cents={o.delivery_cost} /> · {o.delivery_days} days · {(JSON.parse(o.serves_regions) as string[]).join(", ")}</p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          {me && current && (
            <Rise delay={0.2}>
              <div className="rounded-[26px] bg-cream p-6 text-ink">
                <p className="text-[13.5px] text-ink/65">Your contribution</p>
                {mine ? (
                  <>
                    <div className="mt-2 font-display text-[34px] font-semibold leading-none tracking-[-0.035em]"><Amount cents={mine.contribution_amount} stack usdClassName="text-ink/55" /></div>
                    <p className="num mt-3 text-[13.5px] text-ink/70">{mine.allocated_quantity.toLocaleString()} units · goods <Amount cents={mine.goods_cost} /> + delivery <Amount cents={mine.delivery_share} /></p>
                    {mine.estimated_savings !== null && <p className="mt-4 inline-flex rounded-full bg-ink px-3.5 py-1.5 text-[13.5px] text-lime">Saves&nbsp;<Amount cents={mine.estimated_savings} usdClassName="text-paper/60" /></p>}
                    <p className="mt-4 text-[14px]">
                      {myDecision ? <span className="text-ink/70">You {myDecision.decision.replace("_", " ")} this proposal.</span> : current.proposal_status === "approved_by_guardian" ? <Link className="font-medium underline decoration-2 underline-offset-4" href={`/app/pools/${pool.id}/approve`}>Review and decide</Link> : null}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm">You are not included in the current proposal.</p>
                )}
              </div>
            </Rise>
          )}

          <OnchainPanel poolId={pool.id} isMember={!!me} isDemo={!!pool.is_demo} />

          <Card>
            <CardHeader title="Negotiation room" description={d.runs.length ? "Every entry is a recorded execution. Tap one to inspect it." : undefined} />
            <div className="max-h-[760px] overflow-y-auto px-6 pb-6 pt-3">
              {d.runs.length ? <AgentTimeline runs={d.runs} /> : <p className="text-sm text-muted">The agents will report here, step by step, when you run a round.</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
