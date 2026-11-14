import { createHash } from "node:crypto";
import type { Cents } from "./money";
import type { Evaluation } from "./types";

/** The exact financial terms participants approve. Hashed and anchored on NEAR. */
export interface ProposalTerms {
  poolId: string;
  offerId: string;
  currency: "USD";
  unitPrice: Cents;
  deliveryCost: Cents;
  totalQuantity: number;
  totalCost: Cents;
  allocations: { participantId: string; allocatedQuantity: number; contribution: Cents }[];
}

export function termsFromEvaluation(poolId: string, ev: Evaluation): ProposalTerms {
  if (ev.unitPrice === null) throw new Error("Cannot create terms without a unit price");
  return {
    poolId,
    offerId: ev.offerId,
    currency: "USD",
    unitPrice: ev.unitPrice,
    deliveryCost: ev.deliveryCost,
    totalQuantity: ev.totalQuantity,
    totalCost: ev.totalCost,
    allocations: ev.allocations.map((a) => ({
      participantId: a.participantId,
      allocatedQuantity: a.allocatedQuantity,
      contribution: a.contribution,
    })),
  };
}

/** Canonical JSON: fixed key order, allocations sorted by participant id. */
export function canonicalTerms(t: ProposalTerms): string {
  const allocations = [...t.allocations]
    .sort((a, b) => a.participantId.localeCompare(b.participantId))
    .map((a) => ({ participantId: a.participantId, allocatedQuantity: a.allocatedQuantity, contribution: a.contribution }));
  return JSON.stringify({
    poolId: t.poolId,
    offerId: t.offerId,
    currency: t.currency,
    unitPrice: t.unitPrice,
    deliveryCost: t.deliveryCost,
    totalQuantity: t.totalQuantity,
    totalCost: t.totalCost,
    allocations,
  });
}

export function hashTerms(t: ProposalTerms): string {
  return createHash("sha256").update(canonicalTerms(t)).digest("hex");
}
