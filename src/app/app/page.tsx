import Link from "next/link";
import { ArrowRight, ArrowUpRight, Clock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { dashboard } from "@/lib/services/views";
import { ButtonLink, Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { AgentLabel, PoolStatus, relTime, shortDate } from "@/components/status";
import { CostComparisonChart } from "@/components/charts/cost-comparison";
import { Amount } from "@/components/price";
import { CountUp, Fill, Item, Rise, Stagger } from "@/components/motion";

export default async function Overview() {
  const user = await requireUser();
  const d = dashboard(getDb(), user.id);
  const first = user.full_name.split(" ")[0];

  return (
    <div>
      <Rise>
        <PageHeader
          title={`Hey ${first}, here's your buying power.`}
          description={user.business_name ? `${user.business_name} · ${user.location ?? ""}` : "Your collective purchasing overview"}
          actions={<ButtonLink href="/app/demand/new" size="lg">Create demand <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-1" /></ButtonLink>}
        />
      </Rise>

      <Stagger onMount className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Item><Stat accent="lime" label="Active pools" value={<CountUp value={d.activePools.length} />} hint={`${d.opportunities.length} more open near you`} /></Item>
        <Item><Stat label="Pooled demand" value={<><CountUp value={d.totalDemandUnits} /> <span className="text-lg text-muted">units</span></>} hint="Across your active pools" /></Item>
        <Item><Stat label="Group savings" value={d.savings !== null ? <Amount cents={d.savings} stack usdClassName="text-muted" /> : "Pending"} hint="vs everyone buying alone" /></Item>
        <Item><Stat accent={d.pending.length ? "tangerine" : "cream"} label="Waiting on you" value={<CountUp value={d.pending.length} />} hint={d.pending.length ? "approval needed" : "you're all caught up"} /></Item>
      </Stagger>

      {d.pending.length > 0 && (
        <Rise delay={0.3} className="mt-3">
          {d.pending.map((p) => (
            <Link key={p.poolId} href={`/app/pools/${p.poolId}/approve`} className="group flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-tangerine/12 px-6 py-5 transition hover:bg-tangerine/20">
              <p className="text-[15px]"><span className="font-medium text-tangerine">Your approval is needed:</span> {p.proposalLabel} for {p.product.split(" (")[0]}</p>
              <span className="flex items-center gap-2 text-[14px] font-medium text-tangerine">Review terms <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
            </Link>
          ))}
        </Rise>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Rise delay={0.15} className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader title="Alone vs together" description="What you pay in each validated deal, against the best price you could get on your own." />
            <div className="px-6 pb-6 pt-2">
              <CostComparisonChart data={d.myCosts.map((c) => ({ name: c.pool, solo: c.solo, collective: c.collective }))} />
            </div>
          </Card>
        </Rise>

        <Rise delay={0.25} className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader title="Agents at work" action={<Link href="/app/activity" className="rounded-full px-3 py-1 text-[13px] text-muted transition hover:bg-white/5 hover:text-paper">All activity</Link>} />
            <Stagger onMount as="ul" className="px-3 pb-4" delay={0.3} gap={0.06}>
              {d.recentRuns.map((r) => (
                <Item as="li" key={r.id} className="rounded-2xl px-3 py-3 transition hover:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-2">
                    <AgentLabel type={r.agent_type} />
                    <span className="text-[12px] text-muted">{relTime(r.created_at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-paper/75">{r.output_summary}</p>
                </Item>
              ))}
            </Stagger>
          </Card>
        </Rise>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Rise delay={0.3}>
          <Card className="h-full">
            <CardHeader title="Your pools" description="Closest settlement deadline first" />
            <Stagger onMount as="ul" className="px-3 pb-4" delay={0.35}>
              {d.deadlines.map((p) => (
                <Item as="li" key={p.id}>
                  <Link href={`/app/pools/${p.id}`} className="group block rounded-2xl px-3 py-4 transition hover:bg-white/[0.03]">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-display text-[17px] font-semibold tracking-tight transition group-hover:text-lime">{p.product_name.split(" (")[0]}</p>
                      <PoolStatus status={p.status} />
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <Fill value={p.total_demand} max={p.target_quantity} />
                      <span className="num shrink-0 text-[12.5px] text-muted">{p.total_demand.toLocaleString()}/{p.target_quantity.toLocaleString()}</span>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted"><Clock className="size-3.5" /> Settles by {shortDate(p.deadline)} · {p.participant_count} businesses</p>
                  </Link>
                </Item>
              ))}
            </Stagger>
          </Card>
        </Rise>

        <Rise delay={0.35}>
          <Card className="h-full bg-sky text-ink">
            <div className="px-6 pb-2 pt-6">
              <h3 className="font-display text-[19px] font-semibold tracking-[-0.01em]">Open pools you could join</h3>
              <p className="mt-1 text-[13.5px] text-ink/70">Live across the network</p>
            </div>
            <Stagger onMount as="ul" className="px-3 pb-4" delay={0.4}>
              {d.opportunities.slice(0, 5).map((p) => (
                <Item as="li" key={p.id}>
                  <Link href={`/app/pools/${p.id}`} className="group flex items-center justify-between gap-3 rounded-2xl px-3 py-3.5 transition hover:bg-ink/[0.07]">
                    <div className="min-w-0">
                      <p className="truncate font-display text-[17px] font-semibold tracking-tight">{p.product_name.split(" (")[0]}</p>
                      <p className="num text-[12.5px] text-ink/65">{p.delivery_region} · {p.participant_count} businesses · {p.total_demand.toLocaleString()} units</p>
                    </div>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-sky transition-transform duration-300 group-hover:rotate-[-45deg]"><ArrowRight className="size-4" /></span>
                  </Link>
                </Item>
              ))}
            </Stagger>
          </Card>
        </Rise>
      </div>
    </div>
  );
}
