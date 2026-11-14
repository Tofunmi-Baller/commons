/**
 * Agent 2 — Supplier Intelligence.
 * Compares offers for an aggregated demand: price tiers, MOQ, delivery cost,
 * stock, region and lead time. Ranks by landed cost. Deterministic.
 */
import { evaluateCombination } from "../engine/compiler";
import { formatUSD, type Cents } from "../engine/money";
import type { EngineIntent, EngineOffer } from "../engine/types";
import { message, type AgentMessage } from "./types";

export interface OfferAssessment {
  offerId: string;
  supplierName: string;
  sourceType: EngineOffer["sourceType"];
  verified: boolean;
  headlineUnitPrice: Cents | null;
  deliveryCost: Cents;
  landedTotal: Cents;
  operationallyViable: boolean;
  blockers: string[];
  budgetIssues: string[];
  rank: number | null;
}

export function assessOffers(intents: EngineIntent[], offers: EngineOffer[], today: string): OfferAssessment[] {
  const rows = offers
    .filter((o) => intents.some((i) => i.productKey === o.productKey || i.acceptableAlternatives.includes(o.productKey)))
    .map((offer) => {
      const ev = evaluateCombination(offer, intents, offers, today);
      const blockers = ev.violations.filter((v) => v.code !== "BUDGET_EXCEEDED").map((v) => v.message);
      return {
        offerId: offer.id,
        supplierName: offer.supplierName,
        sourceType: offer.sourceType,
        verified: offer.supplierVerified,
        headlineUnitPrice: ev.unitPrice,
        deliveryCost: offer.deliveryCost,
        landedTotal: ev.totalCost,
        operationallyViable: blockers.length === 0,
        blockers: [...new Set(blockers)],
        budgetIssues: ev.violations.filter((v) => v.code === "BUDGET_EXCEEDED").map((v) => v.message),
        rank: null as number | null,
      };
    });
  const viable = rows.filter((r) => r.operationallyViable).sort((a, b) => a.landedTotal - b.landedTotal);
  viable.forEach((r, i) => (r.rank = i + 1));
  return [...viable, ...rows.filter((r) => !r.operationallyViable)];
}

export function compareSuppliers(intents: EngineIntent[], offers: EngineOffer[], today: string): AgentMessage<OfferAssessment[]> {
  const started = performance.now();
  const out = assessOffers(intents, offers, today);
  const viable = out.filter((o) => o.operationallyViable);
  const totalQty = intents.reduce((s, i) => s + i.quantity, 0);
  return message("supplier_intelligence", "Compare supplier offers for aggregated demand", started, {
    inputSummary: `${intents.length} intents totalling ${totalQty} units; ${out.length} matching offers (sample data).`,
    output: out,
    outputSummary: viable.length
      ? `Compared ${out.length} offers. ${viable.length} can serve the full group operationally; lowest landed total is ${viable[0].supplierName} at ${formatUSD(viable[0].landedTotal)}. ${out.length - viable.length} excluded (MOQ, region, stock or lead time).`
      : `Compared ${out.length} offers. None can serve the full group operationally.`,
    status: out.length ? "succeeded" : "failed",
  });
}
