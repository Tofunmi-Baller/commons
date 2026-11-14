export type AgentType =
  | "demand_intelligence"
  | "supplier_intelligence"
  | "negotiation"
  | "financial_guardian"
  | "coordination";

export const AGENT_NAMES: Record<AgentType, string> = {
  demand_intelligence: "Demand Intelligence",
  supplier_intelligence: "Supplier Intelligence",
  negotiation: "Negotiation Agent",
  financial_guardian: "Financial Guardian",
  coordination: "Coordination Agent",
};

export type AgentStatus = "succeeded" | "failed" | "rejected" | "needs_input";
export type ValidationStatus = "passed" | "failed" | "not_applicable";

/** Typed message every agent emits. Persisted 1:1 to the agent_runs table. */
export interface AgentMessage<O = unknown> {
  agent: AgentType;
  task: string;
  inputSummary: string;
  output: O;
  outputSummary: string;
  timestamp: string;
  status: AgentStatus;
  validation: ValidationStatus;
  durationMs: number;
}

export function message<O>(
  agent: AgentType,
  task: string,
  started: number,
  fields: { inputSummary: string; output: O; outputSummary: string; status?: AgentStatus; validation?: ValidationStatus },
): AgentMessage<O> {
  return {
    agent,
    task,
    inputSummary: fields.inputSummary,
    output: fields.output,
    outputSummary: fields.outputSummary,
    timestamp: new Date().toISOString(),
    status: fields.status ?? "succeeded",
    validation: fields.validation ?? "not_applicable",
    durationMs: Math.max(0, Math.round(performance.now() - started)),
  };
}
