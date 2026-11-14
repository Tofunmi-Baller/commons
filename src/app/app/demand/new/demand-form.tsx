"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Brain, Check, CircleAlert, Loader2, Sparkles, X } from "lucide-react";
import { createIntentAction, interpretAction, joinPoolAction, startPoolAction } from "@/app/actions";
import type { ParseResult } from "@/lib/agents/demand-intelligence";
import { Badge, Button, Card, CardHeader, Field, inputClass } from "@/components/ui";
import { Amount } from "@/components/price";
import { dollarsToCents } from "@/lib/engine/money";

type Match = Extract<Awaited<ReturnType<typeof createIntentAction>>, { ok: true }>["data"];

function safeCents(v: string): number {
  try {
    return dollarsToCents(v);
  } catch {
    return 0;
  }
}

const EMPTY = {
  productName: "", productDescription: "", category: "Packaging", quantity: "", maxUnitPrice: "", minQuantity: "",
  deliveryLocation: "", deliveryDeadline: "", preferredSupplierId: "", acceptableAlternatives: "", partialOk: false,
  requireVerifiedSupplier: false, specialConditions: "",
};

export function DemandForm({ categories, suppliers, today }: { categories: string[]; suppliers: { id: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [f, setF] = useState(EMPTY);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [source, setSource] = useState<"form" | "natural_language">("form");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Match | null>(null);
  const [pending, start] = useTransition();
  const maxCents = safeCents(f.maxUnitPrice);
  const set = (k: keyof typeof EMPTY, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  const interpret = () =>
    start(async () => {
      setError(null);
      const r = await interpretAction(text);
      if (!r.ok) return setError(r.error);
      const p = r.data.fields;
      setParsed(r.data);
      setSource("natural_language");
      setF((s) => ({
        ...s,
        productName: p.productName ?? s.productName,
        category: p.category ?? s.category,
        quantity: p.quantity?.toString() ?? s.quantity,
        maxUnitPrice: p.maxUnitPriceUsd?.toString() ?? s.maxUnitPrice,
        deliveryLocation: p.deliveryLocation ?? s.deliveryLocation,
        deliveryDeadline: p.deliveryDeadline ?? s.deliveryDeadline,
        partialOk: p.partialOk ?? s.partialOk,
        specialConditions: p.conditions ?? s.specialConditions,
      }));
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const r = await createIntentAction({
        productName: f.productName, productDescription: f.productDescription, category: f.category,
        quantity: Number(f.quantity), maxUnitPrice: f.maxUnitPrice, minQuantity: f.minQuantity ? Number(f.minQuantity) : undefined,
        deliveryLocation: f.deliveryLocation, deliveryDeadline: f.deliveryDeadline, preferredSupplierId: f.preferredSupplierId || null,
        acceptableAlternatives: f.acceptableAlternatives ? f.acceptableAlternatives.split(",").map((s) => s.trim()).filter(Boolean) : [],
        partialOk: f.partialOk, requireVerifiedSupplier: f.requireVerifiedSupplier, specialConditions: f.specialConditions, source,
      });
      if (!r.ok) return setError(r.error);
      setResult(r.data);
    });
  };

  const go = (fn: () => Promise<{ ok: true; data: { poolId: string } } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error);
      router.push(`/app/pools/${r.data.poolId}`);
    });

  if (result) {
    const compatible = result.poolMatches.filter((m) => m.compatible);
    return (
      <div className="space-y-6">
        <Card className="bg-lime p-6 text-ink">
          <p className="flex items-center gap-2 font-medium"><Check className="size-4" /> Intent saved and matched</p>
          <p className="mt-1 text-[14px] text-ink/70">The Demand Intelligence agent checked open pools and supplier offers. Joining is your choice; nothing happens automatically.</p>
        </Card>
        <Card>
          <CardHeader title="Purchasing pools" description={`${compatible.length} compatible of ${result.poolMatches.length} open`} />
          <ul className="space-y-1 px-3 pb-3">
            {result.poolMatches.map((m) => (
              <li key={m.poolId} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">{m.compatible ? <Check className="size-4 text-lime" /> : <X className="size-4 text-tangerine" />}{m.productName.split(" (")[0]}</p>
                  <ul className="mt-1 space-y-0.5 text-[13px] text-muted">{m.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
                {m.compatible && <Button size="sm" disabled={pending} onClick={() => go(() => joinPoolAction(m.poolId, result.intentId))}>Join pool</Button>}
              </li>
            ))}
            {!result.poolMatches.length && <li className="px-5 py-4 text-sm text-muted">No open pools yet.</li>}
          </ul>
          <div className="mx-3 mb-3 flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-5 py-4">
            <p className="text-[13px] text-muted">Or start a new pool others can join.</p>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => go(() => startPoolAction(result.intentId))}>Start a new pool</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Supplier offers for this product" description="Sample data. Compatibility is checked per your location and deadline." />
          <ul className="space-y-1 px-3 pb-3">
            {result.offers.map((o) => (
              <li key={o.offerId} className="px-5 py-3 text-[13px]">
                <p className="flex items-center gap-2 font-medium">{o.compatible ? <Check className="size-4 text-lime" /> : <X className="size-4 text-tangerine" />}{o.supplierName}</p>
                <ul className="mt-0.5 text-muted">{o.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </li>
            ))}
            {!result.offers.length && <li className="px-5 py-4 text-sm text-muted">No supplier offers exist for this product yet. A pool can still gather demand.</li>}
          </ul>
        </Card>
        {error && <p className="text-sm text-tangerine">{error}</p>}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="h-fit bg-sky text-ink lg:col-span-2">
        <div className="px-6 pb-2 pt-6"><h3 className="flex items-center gap-2 font-display text-[22px] font-semibold tracking-tight"><Brain className="size-5" /> Just say it</h3><p className="mt-1 text-[14px] text-ink/70">The Demand Intelligence agent fills in the form. You check it before anything is saved.</p></div>
        <div className="space-y-3 p-5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="w-full rounded-2xl bg-ink/[0.08] px-4 py-3 text-[15px] text-ink placeholder:text-ink/45 outline-none ring-1 ring-transparent transition focus:ring-ink/40"
            placeholder="I need 2,000 cartons of packaging materials delivered to Williamsburg within two weeks. I want to pay no more than $2.05 per carton." />
          <Button variant="dark" className="w-full" onClick={interpret} disabled={pending || text.trim().length < 5}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Extract fields
          </Button>
          <p className="text-[12px] text-ink/60">Rule-based parser in this build. It never invents a value it did not find.</p>
          {parsed && (
            <div className="space-y-2 rounded-2xl bg-ink p-4 text-[13.5px] text-paper">
              {parsed.missing.length ? (
                <>
                  <p className="flex items-center gap-1.5 text-warn"><CircleAlert className="size-4" /> Needs your input</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-muted">{parsed.questions.map((q) => <li key={q}>{q}</li>)}</ul>
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-lime"><Check className="size-4" /> All essentials found. Review the form.</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(parsed.evidence).map(([k, v]) => <Badge key={k} tone="info" className="normal-case tracking-normal">{k}: “{v}”</Badge>)}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader title="Your purchasing intent" description="Every field is checked again on the server." />
        <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Product name"><input required value={f.productName} onChange={(e) => set("productName", e.target.value)} className={inputClass} placeholder="Corrugated shipping cartons" /></Field></div>
          <div className="sm:col-span-2"><Field label="Product description"><input value={f.productDescription} onChange={(e) => set("productDescription", e.target.value)} className={inputClass} placeholder="Size, grade, specification" /></Field></div>
          <Field label="Category">
            <select value={f.category} onChange={(e) => set("category", e.target.value)} className={inputClass}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Quantity"><input required type="number" min={1} value={f.quantity} onChange={(e) => set("quantity", e.target.value)} className={inputClass} /></Field>
          <Field label="Maximum unit price (USD)" hint="Includes your share of delivery"><input required inputMode="decimal" value={f.maxUnitPrice} onChange={(e) => set("maxUnitPrice", e.target.value)} className={inputClass} placeholder="2.00" />{maxCents > 0 && <span className="mt-1.5 block text-[12.5px] text-lime">≈ <Amount cents={maxCents} /> at the live rate</span>}</Field>
          <Field label="Delivery deadline"><input required type="date" min={today} value={f.deliveryDeadline} onChange={(e) => set("deliveryDeadline", e.target.value)} className={inputClass} /></Field>
          <div className="sm:col-span-2"><Field label="Delivery location" hint="Neighbourhood and city, e.g. Kreuzberg, Berlin"><input required value={f.deliveryLocation} onChange={(e) => set("deliveryLocation", e.target.value)} className={inputClass} /></Field></div>
          <Field label="Preferred supplier">
            <select value={f.preferredSupplierId} onChange={(e) => set("preferredSupplierId", e.target.value)} className={inputClass}>
              <option value="">No preference</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Acceptable alternatives" hint="Comma-separated product names"><input value={f.acceptableAlternatives} onChange={(e) => set("acceptableAlternatives", e.target.value)} className={inputClass} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.partialOk} onChange={(e) => set("partialOk", e.target.checked)} className="size-4 accent-[#cbff4d]" /> Partial fulfilment acceptable</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.requireVerifiedSupplier} onChange={(e) => set("requireVerifiedSupplier", e.target.checked)} className="size-4 accent-[#cbff4d]" /> Verified suppliers only</label>
          {f.partialOk && <Field label="Minimum acceptable quantity"><input type="number" min={1} value={f.minQuantity} onChange={(e) => set("minQuantity", e.target.value)} className={inputClass} /></Field>}
          <div className="sm:col-span-2"><Field label="Additional conditions"><textarea rows={2} value={f.specialConditions} onChange={(e) => set("specialConditions", e.target.value)} className={inputClass} /></Field></div>
          {error && <p className="text-sm text-tangerine sm:col-span-2" role="alert">{error}</p>}
          <div className="sm:col-span-2"><Button size="lg" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Save intent & find matches</Button></div>
        </form>
      </Card>
    </div>
  );
}
