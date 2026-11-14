import { Activity } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { agentRunsForUser } from "@/lib/db/repo";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AgentTimeline } from "@/components/pool/agent-timeline";
import { Rise } from "@/components/motion";

export default async function ActivityPage() {
  const user = await requireUser();
  const runs = agentRunsForUser(getDb(), user.id, 200);
  return (
    <Rise>
      <PageHeader title="The agents, at work" description="Everything the five COMMONS agents did for you and your pools. Each entry is written the moment it runs, never generated for display." />
      <Card className="p-6">
        {runs.length ? <AgentTimeline runs={runs} /> : <EmptyState icon={<Activity className="size-4" />} title="No agent activity yet" body="Create demand or run a negotiation to see the agents work." />}
      </Card>
    </Rise>
  );
}
