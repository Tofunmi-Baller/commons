import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { getDb } from "@/lib/db";
import * as repo from "@/lib/db/repo";
import { compile, evaluateCombination, intentOfferBlockers, soloBaseline } from "@/lib/engine/compiler";
import type { EngineIntent, Evaluation } from "@/lib/engine/types";
import { DEMO_OFFERS, DEMO_PRODUCT, DEMO_USERS } from "@/lib/demo/fixtures";
import { addDays, todayISO } from "@/lib/util";
import { ButtonLink } from "@/components/ui";
import { Logo } from "@/components/shell/logo";
import { Amount, NearTicker } from "@/components/price";
import { CountUp, Item, Stagger, WordRise } from "@/components/motion";
import { Pallet } from "@/components/landing/pallet";
import { Simulator } from "@/components/landing/simulator";
import { Story, type StoryDeal } from "@/components/landing/story";
import { AgentRelay, Marquee } from "@/components/landing/agents";

export const dynamic = "force-dynamic";

const SHORT = ["Bloom Bakery", "Ortiz Coffee", "Loom & Thread"];

function storyData() {
  const today = todayISO();
  const intents: EngineIntent[] = DEMO_USERS.map((u, i) => ({
    id: u.id, participantId: u.id, participantLabel: SHORT[i], productKey: DEMO_PRODUCT.key, productName: DEMO_PRODUCT.name,
    quantity: u.quantity, minQuantity: u.quantity, maxUnitPrice: Math.round(u.maxUnit * 100), deliveryRegion: "New York", deliveryLocation: u.location,
    deliveryDeadline: addDays(today, 14), preferredSupplierId: null, acceptableAlternatives: [], partialOk: false, requireVerifiedSupplier: false,
  }));
  const toDeal = (ev: Evaluation): StoryDeal => ({
    supplier: ev.supplierName, unit: ev.unitPrice ?? 0, delivery: ev.deliveryCost, total: ev.totalCost, savings: ev.totalSavings,
    allocs: ev.allocations.map((a) => ({ name: a.participantLabel, qty: a.allocatedQuantity, contribution: a.contribution, maxAllowed: a.maxAllowed, ok: a.withinBudget, savings: a.savings })),
  });
  const rejected = evaluateCombination(DEMO_OFFERS[0], intents, DEMO_OFFERS, today);
  const result = compile(intents, DEMO_OFFERS, today);
  const accepted = result.best!;
  return {
    intents, today,
    buyers: DEMO_USERS.map((u, i) => ({ name: SHORT[i], city: u.location.split(",")[0], qty: u.quantity, max: Math.round(u.maxUnit * 100), solo: soloBaseline(intents[i], DEMO_OFFERS, today) })),
    offers: DEMO_OFFERS.map((o) => {
      const blockers = intents.flatMap((i) => intentOfferBlockers(i, o, today));
      const moq = intents.reduce((s, i) => s + i.quantity, 0) < o.minimumOrderQuantity;
      return { supplier: o.supplierName, viable: !blockers.length && !moq, note: blockers[0] ? `Doesn't deliver to New York` : moq ? `Minimum order ${o.minimumOrderQuantity.toLocaleString()}; the group needs 4,500` : `From $${(o.tiers.at(-1)!.unitPrice / 100).toFixed(2)} at ${o.tiers.at(-1)!.minQuantity.toLocaleString()}+` };
    }),
    rejected: toDeal(rejected), accepted: toDeal(accepted), combos: result.combinationsEvaluated, acceptedEval: accepted,
  };
}

function network() {
  const db = getDb();
  const pools = repo.listPools(db, "anonymous");
  let savings = 0;
  for (const p of pools) {
    const pr = repo.currentProposal(db, p.id);
    if (pr?.total_savings) savings += pr.total_savings;
  }
  const runs = Object.fromEntries((db.prepare("SELECT agent_type, COUNT(*) AS n FROM agent_runs GROUP BY agent_type").all() as { agent_type: string; n: number }[]).map((r) => [r.agent_type, r.n]));
  const approvals = (db.prepare("SELECT COUNT(*) AS n FROM approvals WHERE decision = 'approved'").get() as { n: number }).n;
  const businesses = (db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM pool_participants WHERE status = 'active'").get() as { n: number }).n;
  return {
    pools: pools.length,
    cities: new Set(pools.map((p) => p.delivery_region)).size,
    units: pools.reduce((s, p) => s + p.total_demand, 0),
    businesses,
    savings,
    approvals,
    runs,
    marquee: pools.map((p) => ({ city: p.delivery_region, product: p.product_name.split(" (")[0], units: p.total_demand, status: p.status })),
  };
}

export default function Landing() {
  const s = storyData();
  const n = network();
  const buyers = s.buyers.map((b, i) => ({
    name: b.name, qty: b.qty,
    soloPerUnit: b.solo ? Math.round(b.solo.cost / b.qty) : 0,
    groupPerUnit: Math.round(s.acceptedEval.allocations[i].contribution / s.acceptedEval.allocations[i].allocatedQuantity),
    color: ["#cbff4d", "#6cc4ff", "#ff6a3d"][i],
  }));

  return (
    <div className="overflow-x-clip">
      <header className="relative z-20 mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Logo className="text-[15px]" />
        <nav className="flex items-center gap-1 text-[14px]">
          <a href="#story" className="hidden rounded-full px-4 py-2 text-muted transition hover:bg-white/5 hover:text-paper md:block">How it works</a>
          <a href="#try" className="hidden rounded-full px-4 py-2 text-muted transition hover:bg-white/5 hover:text-paper md:block">Try it</a>
          <a href="#near" className="hidden rounded-full px-4 py-2 text-muted transition hover:bg-white/5 hover:text-paper md:block">NEAR</a>
          <NearTicker className="mx-3 hidden text-muted sm:inline-flex" />
          <ButtonLink href="/login" size="sm">Open app</ButtonLink>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-10 pt-6 sm:px-8 lg:min-h-[calc(100dvh-5rem)] lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-14 lg:pb-16">
        <div>
          <h1 className="font-display text-[clamp(54px,7.2vw,112px)] font-semibold leading-[0.9] tracking-[-0.055em]">
            <WordRise text="Buy together." />
            <br />
            <WordRise text="Pay less." delay={0.25} className="text-lime" />
          </h1>
          <p className="mt-8 max-w-lg text-[19px] leading-relaxed text-paper/85">
            COMMONS pools orders from small businesses into one bulk deal. AI agents negotiate it, fixed rules check every buyer&apos;s budget, and the agreement is locked on NEAR.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <ButtonLink href="/login" size="lg">Start a purchasing pool <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-1" /></ButtonLink>
            <ButtonLink href="#story" variant="secondary" size="lg">See a deal compile</ButtonLink>
          </div>
        </div>
        <div className="h-[460px] lg:h-[560px]">
          <Pallet buyers={buyers} />
        </div>
      </section>

      <Marquee items={n.marquee} />

      <div id="story" />
      <Story data={{ buyers: s.buyers, offers: s.offers, rejected: s.rejected, accepted: s.accepted, combos: s.combos }} />

      {/* Live thing */}
      <section id="try" aria-labelledby="try-title" className="bg-lime text-ink">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
          <Stagger className="mb-14 grid gap-6 lg:grid-cols-2 lg:items-end">
            <Item as="h2"><span id="try-title" className="block font-display text-[clamp(44px,6.5vw,96px)] font-semibold leading-[0.92] tracking-[-0.05em]">Add your order.</span></Item>
            <Item as="p" className="max-w-md text-[18px] leading-relaxed text-ink/80">Join the New York carton pool below. The real Demand Compiler runs in your browser and re-solves the whole deal as you drag.</Item>
          </Stagger>
          <Simulator intents={s.intents} offers={DEMO_OFFERS} today={s.today} />
        </div>
      </section>

      {/* Agents */}
      <section aria-labelledby="agents-title" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-36">
        <Stagger className="mb-12 grid gap-6 lg:grid-cols-2 lg:items-end">
          <Item as="h2"><span id="agents-title" className="block font-display text-[clamp(40px,5.5vw,80px)] font-semibold leading-[0.95] tracking-[-0.045em]">Five agents. One relay.</span></Item>
          <Item as="p" className="max-w-md text-[18px] leading-relaxed text-paper/80">Each agent does one job and hands off to the next. Every step is written to the record the moment it runs, so you can watch exactly how a deal was reached.</Item>
        </Stagger>
        <AgentRelay runs={n.runs} />
      </section>

      {/* Network now */}
      <section aria-labelledby="net-title" className="bg-cream text-ink">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 id="net-title" className="font-display text-[clamp(40px,5.5vw,80px)] font-semibold leading-[0.95] tracking-[-0.045em]">The network, right now.</h2>
            <p className="max-w-sm text-[15px] leading-relaxed text-ink/70">Live from the demo database: fictional businesses, real executions. Refreshes on every visit.</p>
          </div>
          <Stagger className="mt-14 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
            {[
              { v: n.pools, label: "purchasing pools", sub: `across ${n.cities} cities` },
              { v: n.units, label: "units of pooled demand", sub: `from ${n.businesses} businesses` },
              { v: Object.values(n.runs).reduce((a, b) => a + b, 0), label: "agent runs recorded", sub: "each one a real execution" },
              { v: n.approvals, label: "explicit approvals", sub: "none automatic" },
            ].map((x) => (
              <Item key={x.label}>
                <p className="num font-display text-[clamp(52px,7vw,104px)] font-semibold leading-none tracking-[-0.05em]"><CountUp value={x.v} /></p>
                <p className="mt-3 text-[17px] font-medium">{x.label}</p>
                <p className="text-[14px] text-ink/60">{x.sub}</p>
              </Item>
            ))}
          </Stagger>
          <div className="mt-16 flex flex-wrap items-center justify-between gap-4 rounded-[28px] bg-ink px-8 py-7 text-paper">
            <p className="text-[17px]">Savings in validated proposals, versus each business buying alone</p>
            <p className="font-display text-[34px] font-semibold tracking-tight text-lime"><Amount cents={n.savings} usdClassName="text-paper/60" /></p>
          </div>
        </div>
      </section>

      {/* Guardian */}
      <section aria-labelledby="guard-title" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-36">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 id="guard-title" className="font-display text-[clamp(40px,5vw,72px)] font-semibold leading-[0.95] tracking-[-0.045em]">Your limit is a wall, not a suggestion.</h2>
            <p className="mt-6 max-w-sm text-[17px] leading-relaxed text-paper/80">The Financial Guardian is plain code, not a model. It recomputes every figure in whole cents and blocks any deal that crosses a line you set.</p>
          </div>
          <Stagger as="ul" className="space-y-3" gap={0.07}>
            {[
              ["Agents propose. They never spend.", "No agent can approve, sign or move money."],
              ["Nothing is approved for you.", "Every business clicks approve on the exact terms, every time."],
              ["Approvals are bound to a fingerprint.", "Change one cent and the hash changes; old approvals stop counting."],
              ["Budgets include delivery.", "A cheap sticker price with expensive shipping gets rejected."],
              ["Your limit stays private.", "Others see pass or fail, never your number."],
              ["No invented savings.", "Savings appear only against a real price you could have paid alone."],
            ].map(([t, d]) => (
              <Item as="li" key={t} className="group rounded-[24px] bg-panel p-7 transition-colors duration-500 hover:bg-lime hover:text-ink">
                <p className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">{t}</p>
                <p className="mt-2 text-[16px] text-muted transition-colors duration-500 group-hover:text-ink/70">{d}</p>
              </Item>
            ))}
          </Stagger>
        </div>
      </section>

      {/* NEAR */}
      <section id="near" aria-labelledby="near-title" className="bg-tangerine text-ink">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:py-32">
          <div>
            <h2 id="near-title" className="font-display text-[clamp(44px,6vw,92px)] font-semibold leading-[0.92] tracking-[-0.05em]">Locked on NEAR.</h2>
            <p className="mt-6 max-w-md text-[18px] leading-relaxed text-ink/80">A Rust contract on NEAR testnet records every pool, each buyer&apos;s committed maximum, the agreed terms hash and each buyer&apos;s own signature. Prices show in NEAR at the live rate, with dollars alongside.</p>
            <div className="mt-8 inline-flex rounded-full bg-ink px-5 py-3 text-paper"><NearTicker /></div>
          </div>
          <Stagger as="ul" className="space-y-1">
            {[
              ["create_pool", "registers buyers and their maximums"],
              ["set_proposal", "anchors the terms hash; replacing it wipes approvals, loudly"],
              ["approve", "only the buyer's own account, only the current hash"],
              ["record_settlement", "only after everyone approves, and only once"],
              ["cancel_pool", "explicit rules; approved buyers become refund-eligible"],
            ].map(([fn, what]) => (
              <Item as="li" key={fn} className="flex flex-col gap-1 border-b-2 border-ink/15 py-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <span className="font-display text-[28px] font-semibold tracking-[-0.02em]">{fn.replace("_", " ")}</span>
                <span className="text-[15px] text-ink/75 sm:text-right">{what}</span>
              </Item>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Close */}
      <section aria-labelledby="close-title" className="mx-auto max-w-7xl px-5 pb-10 pt-24 sm:px-8 lg:pt-32">
        <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
          <h2 id="close-title" className="max-w-3xl font-display text-[clamp(40px,5.5vw,84px)] font-semibold leading-[0.95] tracking-[-0.045em]">Stop paying the solo price.</h2>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/login" size="lg">Try the demo <ArrowUpRight className="size-4 transition-transform group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5" /></ButtonLink>
          </div>
        </div>
        <p aria-hidden className="mt-24 select-none font-display text-[clamp(72px,20vw,300px)] font-semibold leading-[0.8] tracking-[-0.07em] text-panel-2">COMMONS</p>
        <div className="mt-6 flex flex-wrap justify-between gap-3 text-[13px] text-muted">
          <p>Built for the NEAR Hackathon 2026. Demo businesses and supplier offers are fictional.</p>
          <p>NEAR price via CoinGecko · Testnet only · <Link href="/login" className="hover:text-paper">Sign in</Link></p>
        </div>
      </section>
    </div>
  );
}
