"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { compile, soloBaseline } from "@/lib/engine/compiler";
import type { EngineIntent, EngineOffer } from "@/lib/engine/types";
import { Amount } from "@/components/price";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The live thing: add your own order to the three-business carton pool and
 * the real Demand Compiler (running in your browser) re-solves the deal.
 */
export function Simulator({ intents, offers, today }: { intents: EngineIntent[]; offers: EngineOffer[]; today: string }) {
  const [qty, setQty] = useState(800);
  const [max, setMax] = useState(200); // cents

  const result = useMemo(() => {
    const you: EngineIntent = { ...intents[0], id: "you", participantId: "you", participantLabel: "You", quantity: qty, minQuantity: qty, maxUnitPrice: max, deliveryLocation: "New York" };
    const group = qty > 0 ? [...intents, you] : intents;
    const res = compile(group, offers, today);
    const best = res.best;
    const mine = best?.allocations.find((a) => a.participantId === "you") ?? null;
    const solo = qty > 0 ? soloBaseline(you, offers, today) : null;
    return { best, mine, solo, total: group.reduce((s, i) => s + i.quantity, 0), combos: res.combinationsEvaluated };
  }, [qty, max, intents, offers, today]);

  const tiers = [...new Set(offers.filter((o) => o.servesRegions.includes("New York")).flatMap((o) => o.tiers.map((t) => t.minQuantity)))].sort((a, b) => a - b);
  const scaleMax = 8000;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
      <div className="space-y-8">
        <label className="block">
          <span className="flex items-baseline justify-between text-[15px]"><span>Your order</span><span className="num font-display text-3xl font-semibold tracking-tight">{qty.toLocaleString()} <span className="text-base font-normal text-ink/60">cartons</span></span></span>
          <input type="range" min={0} max={3500} step={50} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="mt-4 h-3 w-full cursor-pointer appearance-none rounded-full bg-ink/15 accent-ink" aria-label="Your order quantity" />
        </label>
        <label className="block">
          <span className="flex items-baseline justify-between text-[15px]"><span>The most you&apos;ll pay per carton</span><span className="num font-display text-3xl font-semibold tracking-tight"><Amount cents={max} usdClassName="text-base" /></span></span>
          <input type="range" min={150} max={260} step={1} value={max} onChange={(e) => setMax(Number(e.target.value))} className="mt-4 h-3 w-full cursor-pointer appearance-none rounded-full bg-ink/15 accent-ink" aria-label="Maximum price per carton" />
        </label>

        <div>
          <p className="mb-3 text-[15px]">Pool demand against supplier price breaks</p>
          <div className="relative h-14 rounded-2xl bg-ink/10">
            <motion.div className="absolute inset-y-0 left-0 rounded-2xl bg-ink" animate={{ width: `${Math.min(100, (result.total / scaleMax) * 100)}%` }} transition={{ duration: 0.6, ease: EASE }} />
            {tiers.map((t) => (
              <div key={t} className="absolute inset-y-0 flex flex-col justify-end" style={{ left: `${(t / scaleMax) * 100}%` }}>
                <div className={`h-full w-0.5 ${result.total >= t ? "bg-lime" : "bg-ink/25"}`} />
              </div>
            ))}
            <span className="num absolute inset-y-0 left-4 flex items-center font-display text-lg font-semibold text-lime mix-blend-normal">{result.total.toLocaleString()}</span>
          </div>
          <div className="num relative mt-2 h-4 text-[11.5px] text-ink/60">
            {tiers.map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(t / scaleMax) * 100}%` }}>{t / 1000}k</span>)}
          </div>
        </div>
      </div>

      <motion.div layout className="flex flex-col justify-between rounded-[28px] bg-ink p-8 text-paper">
        {result.mine ? (
          <>
            <div>
              <p className="text-[15px] text-muted">The compiler checked {result.combos} combinations and picked</p>
              <p className="mt-1 font-display text-3xl font-semibold tracking-tight">{result.best!.supplierName}</p>
            </div>
            <div className="my-8 grid grid-cols-2 gap-6">
              <div>
                <p className="text-[13.5px] text-muted">You pay per carton</p>
                <p className="mt-1 font-display text-[26px] font-semibold tracking-tight text-lime"><Amount cents={Math.round(result.mine.contribution / result.mine.allocatedQuantity)} stack /></p>
              </div>
              <div>
                <p className="text-[13.5px] text-muted">Alone you&apos;d pay</p>
                <p className="mt-1 font-display text-[26px] font-semibold tracking-tight">{result.solo ? <Amount cents={Math.round(result.solo.cost / qty)} stack /> : "No solo deal"}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[13.5px] text-muted">Your total</p>
                <p className="font-display text-2xl font-semibold"><Amount cents={result.mine.contribution} stack /></p>
              </div>
              {result.mine.savings !== null && result.mine.savings > 0 && (
                <motion.p key={result.mine.savings} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-full bg-lime px-4 py-2 text-[14px] font-medium text-ink">
                  You save <Amount cents={result.mine.savings} usdClassName="text-ink/70" />
                </motion.p>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col justify-center gap-3">
            <p className="font-display text-3xl font-semibold tracking-tight text-tangerine">{qty === 0 ? "Add an order to join" : "No deal fits your limit"}</p>
            <p className="text-[15px] leading-relaxed text-muted">
              {qty === 0 ? "Drag the slider to add your cartons to the pool." : "The Financial Guardian won't let any deal exceed your maximum, delivery included. Raise your limit or change your quantity and the compiler re-solves instantly."}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
