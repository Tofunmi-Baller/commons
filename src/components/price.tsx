"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { formatNear, formatUSD, type Cents } from "@/lib/engine/money";
import type { NearPrice } from "@/lib/price";
import { cn } from "@/lib/cn";

const Ctx = createContext<NearPrice | null>(null);

export function PriceProvider({ initial, children }: { initial: NearPrice | null; children: ReactNode }) {
  const [price, setPrice] = useState(initial);
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/price", { cache: "no-store" });
        const p = (await r.json()) as NearPrice | null;
        if (p) setPrice(p);
      } catch {
        /* keep last rate */
      }
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return <Ctx.Provider value={price}>{children}</Ctx.Provider>;
}

export const useNearPrice = () => useContext(Ctx);

/**
 * A money amount: NEAR first (live rate), USD in brackets. Falls back to USD
 * alone if no rate is available. `stack` puts USD on its own line.
 */
export function Amount({ cents, stack = false, className, usdClassName }: { cents: Cents; stack?: boolean; className?: string; usdClassName?: string }) {
  const price = useNearPrice();
  if (!price) return <span className={cn("num", className)}>{formatUSD(cents)}</span>;
  return (
    <span className={cn("num", stack ? "inline-flex flex-col" : "", className)}>
      <span>{formatNear(cents, price.usd)}</span>
      <span className={cn("opacity-60", stack ? "text-[max(11px,0.62em)] font-normal tracking-normal" : "ml-1.5 text-[0.85em] font-normal", usdClassName)}>({formatUSD(cents)})</span>
    </span>
  );
}

export function NearTicker({ className }: { className?: string }) {
  const price = useNearPrice();
  if (!price) return null;
  const up = (price.change24h ?? 0) >= 0;
  return (
    <span className={cn("num inline-flex items-center gap-2 text-[13px]", className)} title={`CoinGecko · updated ${new Date(price.fetchedAt).toLocaleTimeString()}`}>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-lime" />
      </span>
      NEAR ${price.usd.toFixed(2)}
      {price.change24h !== null && <span className={up ? "text-lime" : "text-tangerine"}>{up ? "▲" : "▼"} {Math.abs(price.change24h).toFixed(1)}%</span>}
    </span>
  );
}
