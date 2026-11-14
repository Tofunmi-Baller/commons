/**
 * Agent 3 — Negotiation.
 * Generates deal proposals within participant constraints. It has NO permission
 * to approve, spend or move funds: its output is an untrusted proposal that
 * must pass the Financial Guardian and explicit participant approval.
 *
 * Strategy sequence:
 *  1. "headline_price" — the conventional opening move: take the offer with the
 *     lowest per-unit sticker price that can operationally serve the whole group.
 *  2. "constraint_optimised" — after a rejection, run the Demand Compiler's full
 *     search over offer × participant combinations using landed costs, excluding
 *     anything already rejected.
 */
import { compile, evaluateCombination } from "../engine/compiler";
import { formatUSD } from "../engine/money";
import type { EngineIntent, EngineOffer, Evaluation } from "../engine/types";
import { message, type AgentMessage } from "./types";

export interface DraftProposal {
  strategy: "headline_price" | "constraint_optimised";
  evaluation: Evaluation;
  rationale: string;
}

function groupKey(ev: Evaluation) {
  return `${ev.offerId}|${ev.allocations.map((a) => a.participantId).sort().join(",")}`;
}

export function openingProposal(intents: EngineIntent[], offers: EngineOffer[], today: string): AgentMessage<DraftProposal | null> {
  const started = performance.now();
  const candidates = offers
    .map((o) => evaluateCombination(o, intents, offers, today))
    .filter((ev) => ev.unitPrice !== null && ev.violations.every((v) => v.code === "BUDGET_EXCEEDED"))
    .sort((a, b) => (a.unitPrice ?? 0) - (b.unitPrice ?? 0));
  const pick = candidates[0] ?? null;
  const draft: DraftProposal | null = pick
    ? {
        strategy: "headline_price",
        evaluation: pick,
        rationale: `Lowest headline price among ${candidates.length} operationally viable offers: ${pick.supplierName} at ${formatUSD(pick.unitPrice!)}/unit for ${pick.totalQuantity} units (${candidates.length > 1 ? `next best ${formatUSD(candidates[1].unitPrice!)}` : "no alternative"}).`,
      }
    : null;
  return message("negotiation", "Generate opening proposal (headline-price strategy)", started, {
    inputSummary: `${intents.length} participants, ${offers.length} offers.`,
    output: draft,
    outputSummary: draft ? draft.rationale : "No offer can operationally serve the full group.",
    status: draft ? "succeeded" : "failed",
  });
}

export function revisedProposal(
  intents: EngineIntent[],
  offers: EngineOffer[],
  today: string,
  rejected: Evaluation[],
): AgentMessage<{ draft: DraftProposal | null; combinationsEvaluated: number; feasibleCount: number }> {
  const started = performance.now();
  const rejectedKeys = new Set(rejected.map(groupKey));
  const result = compile(intents, offers, today);
  const options = result.feasible.filter((ev) => !rejectedKeys.has(groupKey(ev)));
  const best = options[0] ?? null;
  const dropped = best ? intents.filter((i) => !best.allocations.some((a) => a.participantId === i.participantId)) : [];
  const draft: DraftProposal | null = best
    ? {
        strategy: "constraint_optimised",
        evaluation: best,
        rationale:
          `Searched ${result.combinationsEvaluated} offer × participant combinations using landed cost (goods + delivery share). ` +
          `${best.supplierName} at ${formatUSD(best.unitPrice!)}/unit with ${formatUSD(best.deliveryCost)} delivery keeps every included participant within budget` +
          (dropped.length ? `; ${dropped.map((d) => d.participantLabel).join(", ")} cannot be included without breaking a constraint.` : " and serves all participants.") +
          (best.totalSavings !== null ? ` Combined savings vs buying alone: ${formatUSD(best.totalSavings)}.` : ""),
      }
    : null;
  return message("negotiation", "Generate revised proposal (constraint-optimised search)", started, {
    inputSummary: `${intents.length} participants, ${offers.length} offers, ${rejected.length} rejected proposal(s) excluded.`,
    output: { draft, combinationsEvaluated: result.combinationsEvaluated, feasibleCount: options.length },
    outputSummary: draft ? draft.rationale : `Searched ${result.combinationsEvaluated} combinations; no feasible deal remains. Negotiation failed.`,
    status: draft ? "succeeded" : "failed",
  });
}
