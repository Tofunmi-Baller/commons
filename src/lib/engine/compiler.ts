/**
 * COMMONS Demand Compiler — deterministic core.
 *
 * Given purchasing intents and supplier offers it decides which participants can
 * form an economically and operationally viable collective purchase. No AI is
 * involved in any calculation here.
 *
 * Budget rule: a participant's maximum unit price is compared against their
 * LANDED cost (goods + their share of delivery). This protects participants from
 * offers with an attractive headline price but expensive delivery.
 */
import { allocateProportionally, formatUSD, mulCents, sumCents, type Cents } from "./money";
import type { Allocation, EngineIntent, EngineOffer, Evaluation, Violation } from "./types";

export const EXHAUSTIVE_SEARCH_LIMIT = 12;

export function tierPrice(offer: EngineOffer, quantity: number): Cents | null {
  const eligible = offer.tiers
    .filter((t) => quantity >= t.minQuantity)
    .sort((a, b) => b.minQuantity - a.minQuantity);
  return eligible.length ? eligible[0].unitPrice : null;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.UTC(...ymd(fromISO));
  const to = Date.UTC(...ymd(toISO));
  return Math.floor((to - from) / 86_400_000);
}

function ymd(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y, m - 1, d];
}

export function productMatches(intent: EngineIntent, offer: EngineOffer): boolean {
  return intent.productKey === offer.productKey || intent.acceptableAlternatives.includes(offer.productKey);
}

/** Reasons a single intent cannot be served by an offer at all, regardless of group. */
export function intentOfferBlockers(intent: EngineIntent, offer: EngineOffer, today: string): Violation[] {
  const v: Violation[] = [];
  const p = intent.participantId;
  if (!productMatches(intent, offer)) {
    v.push({ code: "PRODUCT_MISMATCH", participantId: p, message: `${offer.productName} is not ${intent.productName} or an accepted alternative.` });
  }
  if (!offer.servesRegions.includes(intent.deliveryRegion)) {
    v.push({ code: "REGION_NOT_SERVED", participantId: p, message: `${offer.supplierName} does not deliver to ${intent.deliveryRegion}.` });
  }
  const daysAvailable = daysBetween(today, intent.deliveryDeadline);
  if (offer.deliveryDays > daysAvailable) {
    v.push({ code: "DEADLINE_MISSED", participantId: p, message: `${offer.supplierName} needs ${offer.deliveryDays} days; ${intent.participantLabel}'s deadline is in ${daysAvailable}.` });
  }
  if (intent.requireVerifiedSupplier && !offer.supplierVerified) {
    v.push({ code: "UNVERIFIED_SUPPLIER", participantId: p, message: `${intent.participantLabel} requires a verified supplier; ${offer.supplierName} is unverified.` });
  }
  return v;
}

/**
 * Best price a participant could get buying their full quantity alone from the
 * offer catalog. This is the only legitimate savings baseline we use.
 */
export function soloBaseline(intent: EngineIntent, offers: EngineOffer[], today: string): { cost: Cents; offerId: string } | null {
  let best: { cost: Cents; offerId: string } | null = null;
  for (const offer of offers) {
    if (intentOfferBlockers(intent, offer, today).length) continue;
    if (intent.quantity < offer.minimumOrderQuantity || intent.quantity > offer.availableQuantity) continue;
    const unit = tierPrice(offer, intent.quantity);
    if (unit === null) continue;
    const cost = mulCents(unit, intent.quantity) + offer.deliveryCost;
    if (!best || cost < best.cost) best = { cost, offerId: offer.id };
  }
  return best;
}

/**
 * Decide allocated quantities. Everyone gets their requested quantity unless the
 * offer's stock is short, in which case participants who accept partial
 * fulfilment are reduced (never below their minimum) in reverse input order.
 */
export function planQuantities(intents: EngineIntent[], available: number): number[] | null {
  const qty = intents.map((i) => i.quantity);
  let excess = qty.reduce((a, b) => a + b, 0) - available;
  for (let k = intents.length - 1; k >= 0 && excess > 0; k--) {
    const it = intents[k];
    if (!it.partialOk) continue;
    const reducible = it.quantity - it.minQuantity;
    const cut = Math.min(reducible, excess);
    qty[k] -= cut;
    excess -= cut;
  }
  return excess > 0 ? null : qty;
}

export function evaluateCombination(
  offer: EngineOffer,
  group: EngineIntent[],
  allOffers: EngineOffer[],
  today: string,
): Evaluation {
  const violations: Violation[] = [];
  const warnings: Violation[] = [];
  const explanation: string[] = [];

  if (group.length === 0) {
    violations.push({ code: "EMPTY_GROUP", message: "No participants in this combination." });
  }
  for (const intent of group) violations.push(...intentOfferBlockers(intent, offer, today));

  const planned = planQuantities(group, offer.availableQuantity);
  const quantities = planned ?? group.map((i) => i.quantity);
  if (!planned) {
    violations.push({
      code: "INSUFFICIENT_STOCK",
      message: `${offer.supplierName} has ${offer.availableQuantity} units available; the group needs at least ${group.reduce((a, i) => a + (i.partialOk ? i.minQuantity : i.quantity), 0)}.`,
    });
  }

  const totalQuantity = quantities.reduce((a, b) => a + b, 0);
  if (totalQuantity < offer.minimumOrderQuantity) {
    violations.push({ code: "BELOW_MOQ", message: `Combined demand of ${totalQuantity} units is below ${offer.supplierName}'s minimum order of ${offer.minimumOrderQuantity}.` });
  }

  const unitPrice = tierPrice(offer, totalQuantity);
  if (unitPrice === null && totalQuantity > 0) {
    violations.push({ code: "BELOW_MOQ", message: `No price tier applies to ${totalQuantity} units.` });
  }

  if (!offer.supplierVerified) {
    warnings.push({ code: "UNVERIFIED_SUPPLIER", message: `${offer.supplierName} is not verified. Offer is ${offer.sourceType === "sample" ? "labelled sample data" : "self-reported by the supplier"}.` });
  }

  const unit = unitPrice ?? 0;
  const deliveryShares = totalQuantity > 0 ? allocateProportionally(offer.deliveryCost, quantities) : quantities.map(() => 0);

  const allocations: Allocation[] = group.map((intent, idx) => {
    const allocatedQuantity = quantities[idx];
    const goodsCost = mulCents(unit, allocatedQuantity);
    const deliveryShare = deliveryShares[idx];
    const contribution = goodsCost + deliveryShare;
    const maxAllowed = mulCents(intent.maxUnitPrice, allocatedQuantity);
    const baseline = soloBaseline(intent, allOffers, today);
    // Savings only compare like with like: the baseline is for the full requested quantity,
    // so we only report savings when the participant receives their full quantity.
    const comparable = baseline && allocatedQuantity === intent.quantity;
    const withinBudget = contribution <= maxAllowed;
    if (!withinBudget && unitPrice !== null) {
      violations.push({
        code: "BUDGET_EXCEEDED",
        participantId: intent.participantId,
        message: `${intent.participantLabel}'s landed cost would be ${formatUSD(contribution)} for ${allocatedQuantity} units (${formatUSD(Math.ceil(contribution / allocatedQuantity))}/unit incl. delivery), above their private maximum unit price.`,
      });
    }
    return {
      participantId: intent.participantId,
      participantLabel: intent.participantLabel,
      intentId: intent.id,
      requestedQuantity: intent.quantity,
      allocatedQuantity,
      maxUnitPrice: intent.maxUnitPrice,
      goodsCost,
      deliveryShare,
      contribution,
      maxAllowed,
      baselineCost: comparable ? baseline.cost : null,
      baselineOfferId: comparable ? baseline.offerId : null,
      savings: comparable ? baseline.cost - contribution : null,
      withinBudget,
    };
  });

  const goodsTotal = sumCents(allocations.map((a) => a.goodsCost));
  const totalCost = goodsTotal + (totalQuantity > 0 ? offer.deliveryCost : 0);
  const savingsKnown = allocations.filter((a) => a.savings !== null);
  const totalSavings = savingsKnown.length ? sumCents(savingsKnown.map((a) => a.savings as Cents)) : null;
  const feasible = violations.length === 0;

  if (unitPrice !== null) {
    explanation.push(`${totalQuantity} units from ${offer.supplierName} unlock the ${formatUSD(unitPrice)}/unit tier.`);
    explanation.push(`Delivery of ${formatUSD(offer.deliveryCost)} is split by quantity.`);
  }
  explanation.push(feasible ? "Every participant stays within their maximum landed unit price." : `${violations.length} constraint violation(s) found.`);

  return {
    offerId: offer.id,
    supplierName: offer.supplierName,
    productKey: offer.productKey,
    totalQuantity,
    unitPrice,
    deliveryCost: totalQuantity > 0 ? offer.deliveryCost : 0,
    goodsTotal,
    totalCost,
    allocations,
    violations,
    warnings,
    feasible,
    totalSavings,
    explanation,
  };
}

function* subsets<T>(items: T[]): Generator<T[]> {
  const n = items.length;
  for (let mask = (1 << n) - 1; mask > 0; mask--) {
    const out: T[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) out.push(items[i]);
    yield out;
  }
}

/** Rank feasible evaluations: serve the most participants, then maximise savings, then minimise cost. */
export function compareEvaluations(a: Evaluation, b: Evaluation): number {
  return (
    b.allocations.length - a.allocations.length ||
    (b.totalSavings ?? -Infinity) - (a.totalSavings ?? -Infinity) ||
    a.totalCost - b.totalCost ||
    a.offerId.localeCompare(b.offerId)
  );
}

export interface CompileResult {
  best: Evaluation | null;
  feasible: Evaluation[];
  /** Full-group evaluation for every offer, feasible or not, for transparency. */
  fullGroup: Evaluation[];
  combinationsEvaluated: number;
}

/**
 * Search every offer × participant subset (exhaustive up to EXHAUSTIVE_SEARCH_LIMIT
 * intents, greedy pruning above that) for the best feasible collective purchase.
 */
export function compile(intents: EngineIntent[], offers: EngineOffer[], today: string): CompileResult {
  const feasible: Evaluation[] = [];
  const fullGroup: Evaluation[] = [];
  let combinationsEvaluated = 0;

  for (const offer of offers) {
    const candidates = intents.filter((i) => productMatches(i, offer));
    if (candidates.length === 0) continue;
    const full = evaluateCombination(offer, candidates, offers, today);
    fullGroup.push(full);
    combinationsEvaluated++;

    if (candidates.length <= EXHAUSTIVE_SEARCH_LIMIT) {
      for (const group of subsets(candidates)) {
        if (group.length === candidates.length) {
          if (full.feasible) feasible.push(full);
          continue;
        }
        const ev = evaluateCombination(offer, group, offers, today);
        combinationsEvaluated++;
        if (ev.feasible) feasible.push(ev);
      }
    } else {
      // Greedy: repeatedly drop the participant responsible for violations.
      let group = [...candidates];
      let ev = full;
      while (!ev.feasible && group.length > 1) {
        const offender = ev.violations.find((v) => v.participantId)?.participantId;
        group = offender ? group.filter((g) => g.participantId !== offender) : group.slice(0, -1);
        ev = evaluateCombination(offer, group, offers, today);
        combinationsEvaluated++;
      }
      if (ev.feasible) feasible.push(ev);
    }
  }

  feasible.sort(compareEvaluations);
  return { best: feasible[0] ?? null, feasible, fullGroup, combinationsEvaluated };
}

/**
 * Explain, for one intent, which existing pools/offers it is compatible with.
 * Used on the Create Demand screen after submission.
 */
export function compatibilityReport(intent: EngineIntent, offers: EngineOffer[], today: string) {
  return offers.map((offer) => {
    const blockers = intentOfferBlockers(intent, offer, today);
    return {
      offerId: offer.id,
      supplierName: offer.supplierName,
      productName: offer.productName,
      compatible: blockers.length === 0,
      reasons: blockers.length
        ? blockers.map((b) => b.message)
        : [`Delivers ${offer.productName} to ${intent.deliveryRegion} in ${offer.deliveryDays} days.`],
    };
  });
}
