import type { AgentRunRow } from "@/lib/db/repo";
import { AgentLabel, RunStatus, relTime } from "@/components/status";
import { Badge } from "@/components/ui";
import { Item, Stagger } from "@/components/motion";

/** Every row corresponds to one persisted agent_runs record — an operation that actually executed. */
export function AgentTimeline({ runs, compact = false }: { runs: (AgentRunRow & { product_name?: string | null })[]; compact?: boolean }) {
  const groups = new Map<string, AgentRunRow[]>();
  for (const r of runs) groups.set(r.run_group, [...(groups.get(r.run_group) ?? []), r]);
  const ordered = [...groups.entries()].sort((a, b) => b[1][0].created_at.localeCompare(a[1][0].created_at));
  return (
    <div className="space-y-6">
      {ordered.map(([group, items], gi) => (
        <div key={group}>
          <p className="mb-4 text-[13px] text-muted">
            {gi === 0 ? "Latest round" : "Earlier round"} · {relTime(items[0].created_at)}
            {"product_name" in items[0] && (items[0] as { product_name?: string | null }).product_name ? ` · ${(items[0] as { product_name?: string }).product_name!.split(" (")[0]}` : ""}
          </p>
          <Stagger onMount as="ol" gap={0.05} className="relative space-y-2 pl-6 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-0.5 before:rounded-full before:bg-white/10">
            {[...items].sort((a, b) => a.seq - b.seq).map((r) => (
              <Item as="li" key={r.id} className="relative">
                <span className={`absolute -left-[24px] top-3 size-3 rounded-full ring-4 ring-panel ${r.status === "succeeded" ? "bg-lime" : r.status === "rejected" || r.status === "failed" ? "bg-tangerine" : "bg-amber"}`} />
                <details className="group rounded-2xl transition-colors open:bg-white/[0.04]">
                  <summary className="cursor-pointer list-none rounded-2xl px-3 py-2.5 transition hover:bg-white/[0.04]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <AgentLabel type={r.agent_type} />
                      <div className="flex items-center gap-1.5">
                        {r.validation_status !== "not_applicable" && <Badge tone={r.validation_status === "passed" ? "good" : "bad"}>validation {r.validation_status}</Badge>}
                        <RunStatus status={r.status} />
                      </div>
                    </div>
                    <p className={`mt-1.5 text-[14px] leading-relaxed text-paper/85 ${compact ? "line-clamp-2" : ""}`}>{r.output_summary}</p>
                  </summary>
                  <div className="space-y-1 px-3 pb-3 text-[12.5px] text-muted">
                    <p><span className="text-paper/70">Task:</span> {r.task}</p>
                    <p><span className="text-paper/70">Input:</span> {r.input_summary}</p>
                    <p className="num"><span className="text-paper/70">Executed:</span> {new Date(r.created_at).toLocaleString("en-GB")} · {r.duration_ms} ms · run {r.run_group.slice(-6)}#{r.seq}</p>
                  </div>
                </details>
              </Item>
            ))}
          </Stagger>
        </div>
      ))}
    </div>
  );
}
