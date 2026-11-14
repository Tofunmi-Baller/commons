"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNear, formatUSD } from "@/lib/engine/money";
import { useNearPrice } from "@/components/price";

export interface CostDatum { name: string; solo: number | null; collective: number }

export function CostComparisonChart({ data, height = 260 }: { data: CostDatum[]; height?: number }) {
  const price = useNearPrice();
  const rows = data.map((d) => ({ name: d.name, "Buying alone": d.solo, "With COMMONS": d.collective }));
  const fmt = (cents: number) => (price ? `${formatNear(cents, price.usd)} (${formatUSD(cents)})` : formatUSD(cents));
  return (
    <div>
      <div className="mb-4 flex gap-5 text-[13px] text-muted">
        <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-white/25" /> Buying alone</span>
        <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-lime" /> With COMMONS</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} barGap={8} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="name" tick={{ fill: "#a19f97", fontSize: 12.5 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#a19f97", fontSize: 12 }} axisLine={false} tickLine={false} width={76} tickFormatter={(v: number) => (price ? `${Math.round(v / 100 / price.usd).toLocaleString()} NEAR` : `$${Math.round(v / 100)}`)} />
          <Tooltip
            cursor={{ fill: "rgba(203,255,77,0.05)", radius: 12 }}
            contentStyle={{ background: "#1c1c1f", border: "none", borderRadius: 16, fontSize: 13, padding: "10px 14px" }}
            labelStyle={{ color: "#f4f1e8", fontWeight: 600, marginBottom: 4 }}
            formatter={(v) => (typeof v === "number" ? fmt(v) : "No solo option")}
          />
          <Bar dataKey="Buying alone" fill="rgba(255,255,255,0.22)" radius={[10, 10, 10, 10]} maxBarSize={44} animationDuration={1200} />
          <Bar dataKey="With COMMONS" fill="#cbff4d" radius={[10, 10, 10, 10]} maxBarSize={44} animationDuration={1400} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
