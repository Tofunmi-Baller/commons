/**
 * Agent 4 — Financial Guardian.
 * Pure deterministic validation; no AI-generated assurances are accepted.
 */
import { validateProposal, type GuardianVerdict } from "../engine/guardian";
import type { ProposalTerms } from "../engine/proposal";
import type { EngineIntent, EngineOffer } from "../engine/types";
import { message, type AgentMessage } from "./types";

export function guardProposal(
  label: string,
  terms: ProposalTerms,
  hash: string,
  intents: EngineIntent[],
  offer: EngineOffer,
  offers: EngineOffer[],
  today: string,
): AgentMessage<GuardianVerdict> {
  const started = performance.now();
  const verdict = validateProposal(terms, hash, intents, offer, offers, today);
  const passed = verdict.checks.filter((c) => c.passed).length;
  return message("financial_guardian", `Validate ${label}`, started, {
    inputSummary: `${label}: ${terms.allocations.length} allocations, hash ${hash.slice(0, 10)}….`,
    output: verdict,
    outputSummary: verdict.approved
      ? `Approved ${label}: ${passed}/${verdict.checks.length} deterministic checks passed.${verdict.warnings.length ? ` Warning: ${verdict.warnings[0].message}` : ""}`
      : `Rejected ${label}: ${verdict.violations[0]?.message ?? "validation failed"}${verdict.violations.length > 1 ? ` (+${verdict.violations.length - 1} more)` : ""}`,
    status: verdict.approved ? "succeeded" : "rejected",
    validation: verdict.approved ? "passed" : "failed",
  });
}
