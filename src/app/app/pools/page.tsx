import Link from "next/link";
import { ArrowUpRight, Clock, Compass, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import * as repo from "@/lib/db/repo";
import { Button, ButtonLink, EmptyState, PageHeader, inputClass } from "@/components/ui";
import { PoolStatus, shortDate } from "@/components/status";
import { Amount } from "@/components/price";
import { Fill, Item, Rise, Stagger } from "@/components/motion";

type SP = Promise<Record<string, string | undefined>>;
const FIELDS = ["bg-panel", "bg-panel", "bg-panel"];

export default async function DiscoverPools({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = getDb();
  const all = repo.listPools(db, user.id).map((p) => {
    const proposal = repo.currentProposal(db, p.id);
    const allocs = proposal ? repo.proposalAllocations(db, proposal.id) : [];
    const savings = allocs.filter((a) => a.estimated_savings !== null);
    return {
      ...p,
      unitPrice: proposal?.unit_price ?? null,
      avgSavings: savings.length ? Math.round(savings.reduce((s, a) => s + a.estimated_savings!, 0) / savings.length) : null,
      progress: p.target_quantity ? Math.round((p.total_demand / p.target_quantity) * 100) : 0,
    };
  });
  const categories = [...new Set(all.map((p) => p.category))].sort();
  const regions = [...new Set(all.map((p) => p.delivery_region))].sort();
  const maxPrice = sp.maxPrice ? Math.round(Number(sp.maxPrice) * 100) : null;
  const pools = all.filter(
    (p) =>
      (!sp.category || p.category === sp.category) &&
      (!sp.region || p.delivery_region === sp.region) &&
      (!maxPrice || (p.unitPrice !== null && p.unitPrice <= maxPrice)) &&
      (!sp.progress || p.progress >= Number(sp.progress)) &&
      (!sp.before || p.deadline <= sp.before) &&
      (sp.status === "all" || !["settled", "cancelled"].includes(p.status)),
  );

  return (
    <div>
      <Rise>
        <PageHeader title="Pools around the world" description={`${all.length} purchasing pools across ${regions.length} cities. Open one to see its demand, its negotiated price and who's in before you join.`} actions={<ButtonLink href="/app/demand/new" size="lg">Create demand</ButtonLink>} />
      </Rise>

      <Rise delay={0.1}>
        <form className="mb-8 grid grid-cols-2 gap-2 rounded-[26px] bg-panel p-3 md:grid-cols-6">
          <select name="category" defaultValue={sp.category ?? ""} className={inputClass} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select name="region" defaultValue={sp.region ?? ""} className={inputClass} aria-label="City">
            <option value="">All cities</option>
            {regions.map((r) => <option key={r}>{r}</option>)}
          </select>
          <input name="maxPrice" type="number" min={0.01} step={0.01} defaultValue={sp.maxPrice} placeholder="Max $ / unit" className={inputClass} aria-label="Maximum unit price in USD" />
          <select name="progress" defaultValue={sp.progress ?? ""} className={inputClass} aria-label="Pool progress">
            <option value="">Any progress</option>
            <option value="50">Half-way or more</option>
            <option value="100">Target reached</option>
          </select>
          <input name="before" type="date" defaultValue={sp.before} className={inputClass} aria-label="Settles before" />
          <div className="flex gap-2">
            <Button variant="primary" className="h-auto flex-1">Filter</Button>
            <Link href="/app/pools" className="grid place-items-center rounded-full px-3 text-[13px] text-muted transition hover:bg-white/5 hover:text-paper">Clear</Link>
          </div>
        </form>
      </Rise>

      {pools.length ? (
        <Stagger onMount className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" gap={0.06}>
          {pools.map((p, i) => {
            const feature = p.user_is_member && i === pools.findIndex((x) => x.user_is_member);
            return (
              <Item key={p.id} className={feature ? "md:col-span-2 xl:col-span-1" : ""}>
                <Link href={`/app/pools/${p.id}`} className={`group flex h-full flex-col rounded-[26px] p-6 transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-1 ${feature ? "bg-lime text-ink" : FIELDS[i % 3]}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className={`text-[13.5px] ${feature ? "text-ink/70" : "text-muted"}`}>{p.delivery_region} · {p.category}</p>
                    <span className={`grid size-9 shrink-0 place-items-center rounded-full transition-transform duration-500 group-hover:rotate-45 ${feature ? "bg-ink text-lime" : "bg-white/[0.06]"}`}><ArrowUpRight className="size-4" /></span>
                  </div>
                  <h3 className="mt-4 font-display text-[26px] font-semibold leading-[1.02] tracking-[-0.03em]">{p.product_name.split(" (")[0]}</h3>
                  <p className={`mt-1 text-[13.5px] ${feature ? "text-ink/65" : "text-muted"}`}>{p.product_name.match(/\((.*)\)/)?.[1]}</p>
                  <div className="mt-6 flex items-center gap-3">
                    <Fill value={p.total_demand} max={p.target_quantity} className={feature ? "bg-ink/15" : ""} barClassName={feature ? "bg-ink" : ""} />
                    <span className="num shrink-0 text-[12.5px]">{p.progress}%</span>
                  </div>
                  <dl className="num mt-5 grid grid-cols-2 gap-4 text-[14px]">
                    <div><dt className={`text-[12.5px] ${feature ? "text-ink/65" : "text-muted"}`}>Unit price</dt><dd className="mt-0.5 font-medium">{p.unitPrice !== null ? <Amount cents={p.unitPrice} stack /> : "Not negotiated"}</dd></div>
                    <div><dt className={`text-[12.5px] ${feature ? "text-ink/65" : "text-muted"}`}>Avg. saving each</dt><dd className="mt-0.5 font-medium">{p.avgSavings !== null ? <Amount cents={p.avgSavings} stack /> : "After negotiation"}</dd></div>
                  </dl>
                  <div className={`mt-auto flex flex-wrap items-center justify-between gap-2 pt-6 text-[12.5px] ${feature ? "text-ink/70" : "text-muted"}`}>
                    <span className="flex items-center gap-1.5"><Users className="size-3.5" /> {p.participant_count} · {p.total_demand.toLocaleString()} units</span>
                    <span className="flex items-center gap-1.5"><Clock className="size-3.5" /> {shortDate(p.deadline)}</span>
                    {feature ? <span className="rounded-full bg-ink px-2.5 py-1 text-[12px] text-lime">you&apos;re in</span> : <PoolStatus status={p.status} />}
                  </div>
                </Link>
              </Item>
            );
          })}
        </Stagger>
      ) : (
        <div className="rounded-[26px] bg-panel"><EmptyState icon={<Compass className="size-5" />} title="Nothing matches those filters" body="Clear a filter or two, or create demand to start a new pool." action={<ButtonLink href="/app/pools" size="sm" variant="secondary">Clear filters</ButtonLink>} /></div>
      )}
    </div>
  );
}
