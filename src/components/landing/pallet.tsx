"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Amount } from "@/components/price";

export interface Buyer { name: string; qty: number; soloPerUnit: number; groupPerUnit: number; color: string }

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The hero device: three separate orders (each paying its solo price) slide
 * together into one pallet, and the per-unit price drops to the group price.
 * Figures come from the real engine output passed in from the server.
 */
export function Pallet({ buyers }: { buyers: Buyer[] }) {
  const [merged, setMerged] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setMerged((m) => !m), 3800);
    const first = setTimeout(() => setMerged(true), 1600);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, []);
  const total = buyers.reduce((s, b) => s + b.qty, 0);

  return (
    <div className="relative flex h-full min-h-[420px] flex-col justify-end rounded-[28px] bg-panel p-6 sm:p-8">
      <div className="absolute inset-x-6 top-6 flex items-center justify-between sm:inset-x-8 sm:top-8">
        <p className="text-[13px] text-muted">{merged ? "One pooled order" : "Three separate orders"}</p>
        <motion.p key={String(merged)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="num text-[13px] text-paper">
          {merged ? `${total.toLocaleString()} cartons` : "buying alone"}
        </motion.p>
      </div>

      <motion.div layout className={`flex items-end ${merged ? "justify-center gap-0" : "justify-between gap-3"}`} transition={{ duration: 1, ease: EASE }}>
        {buyers.map((b, i) => {
          const boxes = Math.round(b.qty / 250);
          return (
            <motion.div layout key={b.name} transition={{ duration: 1, ease: EASE }} className="flex flex-col items-center">
              <AnimatePresence>
                {!merged && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-3 text-center">
                    <p className="text-[12px] text-muted">{b.name}</p>
                    <p className="text-[13px] text-paper"><Amount cents={b.soloPerUnit} stack className="items-center" /></p>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex flex-col-reverse gap-1">
                {Array.from({ length: boxes }).map((_, k) => (
                  <motion.div
                    key={k}
                    className="h-5 rounded-[5px] sm:h-6"
                    style={{ background: b.color, width: merged ? 92 : 64 }}
                    initial={{ opacity: 0, y: -30 }}
                    animate={{ opacity: 1, y: 0, width: merged ? 92 : 64 }}
                    transition={{ duration: 0.6, ease: EASE, delay: 0.2 + i * 0.12 + k * 0.05 }}
                  />
                ))}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      <div className="mt-5 h-3 rounded-full bg-white/10" aria-hidden />

      <div className="mt-6 flex min-h-16 items-end justify-between gap-4">
        <AnimatePresence mode="wait">
          {merged ? (
            <motion.div key="g" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.5, ease: EASE }}>
              <p className="text-[13px] text-muted">Everyone now pays, delivery included</p>
              <p className="font-display text-[28px] font-semibold tracking-[-0.03em] text-lime"><Amount cents={buyers[0].groupPerUnit} /> <span className="text-[15px] font-normal text-muted">per carton</span></p>
            </motion.div>
          ) : (
            <motion.div key="s" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.5, ease: EASE }}>
              <p className="text-[13px] text-muted">Alone, each pays a different, higher price</p>
              <p className="font-display text-[28px] font-semibold tracking-[-0.03em] text-paper">Up to <Amount cents={Math.max(...buyers.map((b) => b.soloPerUnit))} /></p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
