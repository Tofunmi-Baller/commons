/**
 * Financial Guardian rules — deterministic validation of any proposed deal.
 * Nothing here trusts the proposer (human, agent or AI). Every figure is
 * recomputed from raw intents and offer data.
 */
import { evaluateCombination } from "./compiler";
import { formatUSD, mulCents, sumCents } from "./money";
import { hashTerms, type ProposalTerms } from "./proposal";
import type { EngineIntent, EngineOffer, Violation } from "./types";

export interface GuardianVerdict {
  approved: boolean;
  violations: Violation[];
  warnings: Violation[];
  checks: { name: string; passed: boolean; detail: string }[];
}

export function offerSanity(offer: EngineOffer): Violation[] {
  const v: Violation[] = [];
  const tiers = [...offer.tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  if (tiers.length === 0) v.push({ code: "SUSPICIOUS_OFFER", message: `${offer.supplierName} has no price tiers.` });
  if (tiers.some((t) => !Number.isSafeInteger(t.unitPrice) || t.unitPrice <= 0)) {
    v.push({ code: "SUSPICIOUS_OFFER", message: `${offer.supplierName} lists a non-positive or non-integer unit price.` });
  }
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].unitPrice > tiers[i - 1].unitPrice) {
      v.push({ code: "SUSPICIOUS_OFFER", message: `${offer.supplierName}'s price rises with volume (${formatUSD(tiers[i - 1].unitPrice)} → ${formatUSD(tiers[i].unitPrice)}), inconsistent with a bulk discount.` });
    }
  }
  if (offer.deliveryCost < 0 || !Number.isSafeInteger(offer.deliveryCost)) {
    v.push({ code: "SUSPICIOUS_OFFER", message: `${offer.supplierName} has an invalid delivery cost.` });
  }
  return v;
}

export function validateProposal(
  terms: ProposalTerms,
  claimedHash: string | null,
  intents: EngineIntent[],
  offer: EngineOffer,
  allOffers: EngineOffer[],
  today: string,
): GuardianVerdict {
  const violations: Violation[] = [];
  const checks: GuardianVerdict["checks"] = [];
  const check = (name: string, passed: boolean, detail: string, v?: Violation) => {
    checks.push({ name, passed, detail });
    if (!passed && v) violations.push(v);
  };

  // 1. Offer sanity.
  const sanity = offerSanity(offer);
  check("Offer consistency", sanity.length === 0, sanity.length ? sanity.map((s) => s.message).join(" ") : "Price tiers decrease with volume; amounts are valid.");
  violations.push(...sanity);

  // 2. Every allocation maps to a known intent.
  const byParticipant = new Map(intents.map((i) => [i.participantId, i]));
  const group: EngineIntent[] = [];
  for (const a of terms.allocations) {
    const intent = byParticipant.get(a.participantId);
    if (!intent) {
      check("Participant known", false, `Unknown participant ${a.participantId}.`, { code: "ARITHMETIC_MISMATCH", participantId: a.participantId, message: "Allocation references an unknown participant." });
      continue;
    }
    group.push(intent);
    const lo = intent.partialOk ? intent.minQuantity : intent.quantity;
    check(
      `Quantity range · ${intent.participantLabel}`,
      a.allocatedQuantity >= lo && a.allocatedQuantity <= intent.quantity,
      `${a.allocatedQuantity} allocated; acceptable range ${lo}–${intent.quantity}.`,
      { code: "ALLOCATION_OUT_OF_RANGE", participantId: a.participantId, message: `${intent.participantLabel} allocated ${a.allocatedQuantity}, outside ${lo}–${intent.quantity}.` },
    );
    // Direct budget check, independent of the evaluator.
    const maxAllowed = mulCents(intent.maxUnitPrice, a.allocatedQuantity);
    check(
      `Budget · ${intent.participantLabel}`,
      a.contribution <= maxAllowed,
      a.contribution <= maxAllowed ? `Contribution ${formatUSD(a.contribution)} is within the participant's limit.` : `Contribution ${formatUSD(a.contribution)} exceeds the participant's limit.`,
      { code: "BUDGET_EXCEEDED", participantId: a.participantId, message: `${intent.participantLabel} would pay ${formatUSD(a.contribution)} (${formatUSD(Math.ceil(a.contribution / Math.max(1, a.allocatedQuantity)))}/unit landed), above their private maximum.` },
    );
  }

  // 3. Totals add up exactly.
  const qtySum = terms.allocations.reduce((s, a) => s + a.allocatedQuantity, 0);
  check("Quantity totals", qtySum === terms.totalQuantity, `Allocations sum to ${qtySum}; proposal states ${terms.totalQuantity}.`, { code: "ARITHMETIC_MISMATCH", message: "Allocated quantities do not sum to the proposal total." });
  const contribSum = sumCents(terms.allocations.map((a) => a.contribution));
  check("Contribution totals", contribSum === terms.totalCost, `Contributions sum to ${formatUSD(contribSum)}; proposal states ${formatUSD(terms.totalCost)}.`, { code: "ARITHMETIC_MISMATCH", message: "Contributions do not sum to the proposal total cost." });

  // 4. Independent recomputation must match the stated terms exactly.
  if (group.length === terms.allocations.length && group.length > 0) {
    const ev = evaluateCombination(offer, group, allOffers, today);
    const operational = ev.violations.filter((v) => v.code !== "BUDGET_EXCEEDED");
    check("Operational constraints", operational.length === 0, operational.length ? operational.map((v) => v.message).join(" ") : "MOQ, stock, delivery region and deadlines satisfied.");
    violations.push(...operational);
    const priceOk = ev.unitPrice === terms.unitPrice && ev.deliveryCost === terms.deliveryCost && ev.totalCost === terms.totalCost;
    check("Price recomputation", priceOk, priceOk ? `Unit price ${formatUSD(terms.unitPrice)} matches the supplier tier.` : `Recomputed ${ev.unitPrice === null ? "no tier" : formatUSD(ev.unitPrice)}/unit, total ${formatUSD(ev.totalCost)}.`, { code: "ARITHMETIC_MISMATCH", message: "Stated prices do not match a recomputation from the supplier offer." });
    const allocOk = ev.allocations.every((x, i) => x.allocatedQuantity === terms.allocations[i].allocatedQuantity && x.contribution === terms.allocations[i].contribution);
    check("Allocation recomputation", allocOk, allocOk ? "Every contribution matches the deterministic split." : "Stated contributions differ from the deterministic split.", { code: "ARITHMETIC_MISMATCH", message: "Participant contributions differ from deterministic recomputation." });
  }

  // 5. Integrity: the hash participants see must match these exact terms.
  if (claimedHash !== null) {
    const actual = hashTerms(terms);
    check("Proposal integrity", actual === claimedHash, actual === claimedHash ? `Hash ${actual.slice(0, 12)}… matches.` : "Terms were modified after hashing.", { code: "HASH_MISMATCH", message: "Proposal terms do not match their recorded hash." });
  }

  const warnings: Violation[] = [];
  if (!offer.supplierVerified) {
    warnings.push({ code: "UNVERIFIED_SUPPLIER", message: `${offer.supplierName} is unverified${offer.sourceType === "sample" ? " (labelled sample data)" : ""}. Treat its claims as unconfirmed.` });
  }

  return { approved: violations.length === 0, violations, warnings, checks };
}

export interface ApprovalRecord {
  participantId: string;
  decision: "approved" | "rejected" | "revision_requested";
  proposalHash: string;
}

export function approvalStatus(participantIds: string[], approvals: ApprovalRecord[], proposalHash: string) {
  const current = approvals.filter((a) => a.proposalHash === proposalHash);
  const decided = new Map(current.map((a) => [a.participantId, a.decision]));
  const approved = participantIds.filter((p) => decided.get(p) === "approved");
  const rejected = participantIds.filter((p) => decided.get(p) === "rejected" || decided.get(p) === "revision_requested");
  const missing = participantIds.filter((p) => !decided.has(p));
  return { approved, rejected, missing, complete: missing.length === 0 && rejected.length === 0 && participantIds.length > 0 };
}

export interface SettlementInput {
  proposalStatus: string;
  guardianApproved: boolean;
  participantIds: string[];
  approvals: ApprovalRecord[];
  proposalHash: string;
  deadline: string;
  today: string;
  alreadySettled: boolean;
  cancelled: boolean;
}

export function settlementEligibility(s: SettlementInput): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (s.cancelled) reasons.push("Pool is cancelled.");
  if (s.alreadySettled) reasons.push("Pool is already settled; double settlement is not allowed.");
  if (!s.guardianApproved) reasons.push("Financial Guardian has not approved this proposal.");
  if (s.proposalStatus !== "approved_by_guardian" && s.proposalStatus !== "fully_approved") reasons.push(`Proposal status is ${s.proposalStatus}.`);
  const st = approvalStatus(s.participantIds, s.approvals, s.proposalHash);
  if (st.missing.length) reasons.push(`${st.missing.length} participant approval(s) missing.`);
  if (st.rejected.length) reasons.push(`${st.rejected.length} participant(s) rejected or requested revision.`);
  if (s.today > s.deadline) reasons.push("Settlement deadline has passed.");
  return { eligible: reasons.length === 0, reasons };
}
