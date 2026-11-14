"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

const AGENTS = [
  { name: "Demand Intelligence", does: "reads what you need, in plain words, and asks for anything missing instead of guessing." },
  { name: "Supplier Intelligence", does: "compares price breaks, minimum orders, stock, lead times and delivery for every offer." },
  { name: "Negotiation", does: "proposes deals and keeps searching when one fails. It can never approve or spend." },
  { name: "Financial Guardian", does: "recomputes every cent with fixed rules and rejects any deal that breaks a buyer's limit." },
  { name: "Coordination", does: "runs each round, watches deadlines and collects every buyer's explicit approval." },
];

/** A baton passes down the line of agents, one hand-off at a time. */
export function AgentRelay({ runs }: { runs: Record<string, number> }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % AGENTS.length), 1800);
    return () => clearInterval(id);
  }, []);
  const keys = ["demand_intelligence", "supplier_intelligence", "negotiation", "financial_guardian", "coordination"];
  return (
    <ol className="relative">
      {AGENTS.map((a, i) => {
        const on = i === active;
        return (
          <li key={a.name} onMouseEnter={() => setActive(i)} className="group relative grid cursor-default grid-cols-[auto_1fr] items-baseline gap-x-6 py-5 sm:grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1fr)] sm:gap-x-10">
            <span className="relative flex size-4 translate-y-[-0.2em] items-center justify-center">
              <motion.span className="absolute size-4 rounded-full bg-lime" animate={{ scale: on ? 1 : 0.35, opacity: on ? 1 : 0.35 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} />
            </span>
            <motion.p animate={{ x: on ? 12 : 0, color: on ? "#cbff4d" : "#f4f1e8" }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-[34px] font-semibold leading-none tracking-[-0.035em] sm:text-[56px] lg:text-[68px]">
              {a.name}
            </motion.p>
            <div className="col-start-2 mt-3 sm:col-start-3 sm:mt-0">
              <motion.p animate={{ opacity: on ? 1 : 0.45 }} className="text-[16px] leading-relaxed">{a.does}</motion.p>
              <p className="num mt-1 text-[13px] text-muted">{(runs[keys[i]] ?? 0).toLocaleString()} recorded runs on this network</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Marquee({ items }: { items: { city: string; product: string; units: number; status: string }[] }) {
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden py-6" aria-label="Live pools on the network">
      <div className="flex w-max animate-marquee gap-4 hover:[animation-play-state:paused]">
        {row.map((p, i) => (
          <div key={i} className="flex items-center gap-4 whitespace-nowrap rounded-full bg-panel px-6 py-3" aria-hidden={i >= items.length}>
            <span className="font-display text-lg font-semibold tracking-tight">{p.city}</span>
            <span className="text-[14px] text-muted">{p.product}</span>
            <span className="num text-[14px] text-paper">{p.units.toLocaleString()} units</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${p.status === "approved" ? "bg-lime text-ink" : p.status === "awaiting_approval" ? "bg-amber/20 text-amber" : "bg-white/10 text-paper"}`}>
              {p.status === "approved" ? "all approved" : p.status === "awaiting_approval" ? "awaiting approval" : "forming"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
