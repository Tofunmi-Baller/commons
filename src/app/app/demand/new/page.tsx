import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CATEGORIES } from "@/lib/agents/demand-intelligence";
import { PageHeader } from "@/components/ui";
import { todayISO } from "@/lib/util";
import { DemandForm } from "./demand-form";

export default async function NewDemand() {
  await requireUser();
  const suppliers = getDb().prepare("SELECT id, name FROM suppliers ORDER BY name").all().map((r) => ({ id: String(r.id), name: String(r.name) }));
  return (
    <div>
      <PageHeader title="What do you need?" description="Tell COMMONS what you need and the most you will pay. Agents find buyers with matching demand; you stay in control of every commitment." />
      <DemandForm categories={CATEGORIES} suppliers={suppliers} today={todayISO()} />
    </div>
  );
}
