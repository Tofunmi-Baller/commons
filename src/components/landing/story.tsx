"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Amount } from "@/components/price";

const EASE = [0.16, 1, 0.3, 1] as const;

export interface StoryAlloc { name: string; qty: number; contribution: number; maxAllowed: number; ok: boolean; savings: number | null }
export interface StoryDeal { supplier: string; unit: number; delivery: number; total: number; allocs: StoryAlloc[]; savings: number | null }
export interface StoryData {
  buyers: { name: string; city: string; qty: number; max: number }[];
  offers: { supplier: string; note: string; viable: boolean }[];
  rejected: StoryDeal;
  accepted: StoryDeal;
  combos: number;
}

const STEPS = [
  { title: "Three orders, one city.", body: "A bakery, a coffee roaster and a clothing label in New York all need shipping cartons. Each one sets a private limit, delivery included." },
  { title: "Four suppliers, compared.", body: "Supplier Intelligence checks price breaks, minimum orders, stock, delivery regions and lead times. Two can't serve this group at all." },
  { title: "The cheap offer that isn't.", body: "The Negotiation agent opens with the lowest sticker price. The Financial Guardian recomputes every cent and rejects it: delivery pushes one buyer over their limit." },
  { title: "A deal that fits everyone.", body: "The agent re-solves across every supplier and buyer combination using landed cost. Every buyer stays under their limit and pays less than buying alone." },
  { title: "Signed, then locked on NEAR.", body: "Each business approves the exact terms. The contract records the terms hash and every signature, and refuses settlement until everyone has approved." },
];

export function Story({ data }: { data: StoryData }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [step, setStep] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setStep(Math.min(STEPS.length - 1, Math.floor(v * STEPS.length * 0.999))));

  return (
    <section ref={ref} aria-labelledby="story-title" className="relative" style={{ height: `${STEPS.length * 85}vh` }}>
      <div className="sticky top-0 flex min-h-dvh items-center py-16">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div className="flex flex-col justify-center">
            <h2 id="story-title" className="font-display text-[15px] font-medium text-lime">Watch one deal compile</h2>
            <div className="relative mt-6 min-h-[260px]">
              <AnimatePresence mode="wait">
                <motion.div key={step} initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -28 }} transition={{ duration: 0.55, ease: EASE }}>
                  <p className="font-display text-[42px] font-semibold leading-[1] tracking-[-0.035em] sm:text-[60px]">{STEPS[step].title}</p>
                  <p className="mt-6 max-w-md text-[17px] leading-relaxed text-paper/80">{STEPS[step].body}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="mt-8 flex gap-2" aria-hidden>
              {STEPS.map((_, i) => (
                <motion.span key={i} className="h-1.5 rounded-full" animate={{ width: i === step ? 48 : 16, backgroundColor: i <= step ? "#cbff4d" : "rgba(255,255,255,0.15)" }} transition={{ duration: 0.5, ease: EASE }} />
              ))}
            </div>
          </div>

          <div className="relative min-h-[460px]">
            <AnimatePresence mode="wait">
              <motion.div key={step} className="absolute inset-0" initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: -20 }} transition={{ duration: 0.6, ease: EASE }}>
                {step === 0 && <Buyers data={data} />}
                {step === 1 && <Offers data={data} />}
                {step === 2 && <Deal deal={data.rejected} verdict="rejected" />}
                {step === 3 && <Deal deal={data.accepted} verdict="approved" combos={data.combos} />}
                {step === 4 && <Signed data={data} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

const COLORS = ["bg-lime", "bg-sky", "bg-tangerine"];

function Buyers({ data }: { data: StoryData }) {
  return (
    <div className="grid h-full gap-3">
      {data.buyers.map((b, i) => (
        <motion.div key={b.name} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12, duration: 0.7, ease: EASE }} className={`${COLORS[i]} flex items-end justify-between rounded-[24px] p-6 text-ink`}>
          <div>
            <p className="font-display text-2xl font-semibold tracking-tight">{b.name}</p>
            <p className="text-[14px] text-ink/70">{b.city}</p>
          </div>
          <div className="text-right">
            <p className="num font-display text-3xl font-semibold tracking-tight">{b.qty.toLocaleString()}</p>
            <p className="text-[13px] text-ink/70">cartons · limit <Amount cents={b.max} usdClassName="text-ink/60" /></p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function Offers({ data }: { data: StoryData }) {
  return (
    <div className="grid h-full grid-cols-2 gap-3">
      {data.offers.map((o, i) => (
        <motion.div key={o.supplier} initial={{ opacity: 0, rotate: -2, y: 30 }} animate={{ opacity: 1, rotate: 0, y: 0 }} transition={{ delay: i * 0.1, duration: 0.7, ease: EASE }}
          className={`flex flex-col justify-between rounded-[24px] p-6 ${o.viable ? "bg-panel-2" : "bg-panel opacity-60"}`}>
          <span className={`grid size-9 place-items-center rounded-full ${o.viable ? "bg-lime text-ink" : "bg-tangerine/20 text-tangerine"}`}>{o.viable ? <Check className="size-4" /> : <X className="size-4" />}</span>
          <div>
            <p className="font-display text-xl font-semibold tracking-tight">{o.supplier}</p>
            <p className="mt-1 text-[13.5px] leading-snug text-muted">{o.note}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function Deal({ deal, verdict, combos }: { deal: StoryDeal; verdict: "approved" | "rejected"; combos?: number }) {
  const ok = verdict === "approved";
  return (
    <div className={`relative flex h-full flex-col justify-between overflow-hidden rounded-[28px] p-7 ${ok ? "bg-lime text-ink" : "bg-panel-2"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-[14px] ${ok ? "text-ink/70" : "text-muted"}`}>{ok ? `Re-solved across ${combos} combinations` : "Opening proposal · lowest sticker price"}</p>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight">{deal.supplier}</p>
          <p className={`mt-1 text-[14px] ${ok ? "text-ink/70" : "text-muted"}`}><Amount cents={deal.unit} /> per carton + <Amount cents={deal.delivery} /> delivery</p>
        </div>
        <motion.span initial={{ scale: 2.2, opacity: 0, rotate: -18 }} animate={{ scale: 1, opacity: 1, rotate: -8 }} transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 16 }}
          className={`shrink-0 rounded-xl px-4 py-2 font-display text-lg font-bold uppercase tracking-wide ${ok ? "bg-ink text-lime" : "bg-tangerine text-ink"}`}>
          {ok ? "Approved" : "Rejected"}
        </motion.span>
      </div>
      <div className="mt-6 space-y-2">
        {deal.allocs.map((a, i) => (
          <motion.div key={a.name} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1, ease: EASE, duration: 0.6 }}
            className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${ok ? "bg-ink/[0.07]" : a.ok ? "bg-white/[0.04]" : "bg-tangerine/15"}`}>
            <span className="text-[15px]">{a.name}</span>
            <span className="flex items-center gap-3 text-[14px]">
              <span className="num"><Amount cents={Math.round(a.contribution / a.qty)} /> /carton</span>
              <span className={`grid size-6 place-items-center rounded-full ${a.ok ? (ok ? "bg-ink text-lime" : "bg-lime text-ink") : "bg-tangerine text-ink"}`}>{a.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}</span>
            </span>
          </motion.div>
        ))}
      </div>
      <div className="mt-6 flex items-end justify-between">
        <p className={`text-[14px] ${ok ? "text-ink/70" : "text-muted"}`}>Group total</p>
        <p className="font-display text-2xl font-semibold"><Amount cents={deal.total} /></p>
      </div>
      {ok && deal.savings !== null && <p className="mt-2 text-right text-[14px] font-medium">Saves <Amount cents={deal.savings} usdClassName="text-ink/60" /> vs buying alone</p>}
    </div>
  );
}

function Signed({ data }: { data: StoryData }) {
  const steps = ["create_pool", "set_proposal", ...data.buyers.map((b) => `approve · ${b.name}`), "record_settlement"];
  return (
    <div className="flex h-full flex-col justify-between rounded-[28px] bg-tangerine p-7 text-ink">
      <p className="text-[14px] text-ink/70">COMMONS contract · NEAR testnet</p>
      <ol className="my-6 space-y-2">
        {steps.map((s, i) => (
          <motion.li key={s} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.16, ease: EASE, duration: 0.5 }} className="flex items-center gap-3 font-display text-xl font-semibold tracking-tight">
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.35 + i * 0.16, type: "spring", stiffness: 400, damping: 18 }} className="grid size-7 place-items-center rounded-full bg-ink text-tangerine"><Check className="size-4" /></motion.span>
            {s}
          </motion.li>
        ))}
      </ol>
      <p className="text-[15px] leading-relaxed">Every call is signed by the participant&apos;s own wallet and verified on-chain before COMMONS shows it.</p>
    </div>
  );
}
