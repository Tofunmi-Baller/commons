import { Badge, type Tone } from "@/components/ui";
import { AGENT_NAMES, type AgentType } from "@/lib/agents/types";
import { Boxes, Brain, Handshake, ShieldCheck, Workflow } from "lucide-react";

const POOL: Record<string, [string, Tone]> = {
  forming: ["Forming", "neutral"],
  negotiating: ["Negotiating", "info"],
  awaiting_approval: ["Awaiting approval", "warn"],
  approved: ["Approved", "good"],
  committed: ["Committed on NEAR", "good"],
  settled: ["Settled", "good"],
  cancelled: ["Cancelled", "bad"],
};
export function PoolStatus({ status }: { status: string }) {
  const [label, tone] = POOL[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

const PROPOSAL: Record<string, [string, Tone]> = {
  draft: ["Draft", "neutral"],
  rejected_by_guardian: ["Rejected by Guardian", "bad"],
  approved_by_guardian: ["Guardian approved", "good"],
  fully_approved: ["All participants approved", "good"],
  superseded: ["Superseded", "neutral"],
  participant_rejected: ["Rejected by participant", "bad"],
};
export function ProposalStatus({ status }: { status: string }) {
  const [label, tone] = PROPOSAL[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}

export const AGENT_META: Record<AgentType, { icon: typeof Brain; color: string; stage: string }> = {
  demand_intelligence: { icon: Brain, color: "text-sky", stage: "Demand analysis" },
  supplier_intelligence: { icon: Boxes, color: "text-amber", stage: "Supplier comparison" },
  negotiation: { icon: Handshake, color: "text-paper", stage: "Negotiation" },
  financial_guardian: { icon: ShieldCheck, color: "text-lime", stage: "Financial validation" },
  coordination: { icon: Workflow, color: "text-tangerine", stage: "Participant approval" },
};

export function AgentLabel({ type }: { type: string }) {
  const meta = AGENT_META[type as AgentType];
  const Icon = meta?.icon ?? Workflow;
  return (
    <span className="inline-flex items-center gap-2 text-[13.5px] font-medium">
      <Icon className={`size-4 ${meta?.color ?? "text-muted"}`} aria-hidden />
      {AGENT_NAMES[type as AgentType] ?? type}
    </span>
  );
}

export function RunStatus({ status }: { status: string }) {
  const tone: Tone = status === "succeeded" ? "good" : status === "rejected" ? "bad" : status === "failed" ? "bad" : "warn";
  const label = status === "needs_input" ? "needs input" : status;
  return <Badge tone={tone}>{label}</Badge>;
}

export function relTime(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.max(s, 0)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function shortDate(iso: string) {
  return new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
