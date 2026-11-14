import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import * as repo from "@/lib/db/repo";
import { Amount } from "@/components/price";
import { Rise } from "@/components/motion";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { PoolStatus, shortDate } from "@/components/status";

export default async function Purchases() {
  const user = await requireUser();
  const db = getDb();
  const intents = repo.intentsForUser(db, user.id);
  const memberships = db.prepare("SELECT pool_id, intent_id, status FROM pool_participants WHERE user_id = ?").all(user.id) as { pool_id: string; intent_id: string; status: string }[];
  return (
    <Rise>
      <PageHeader title="What you are buying" description="Your purchasing intents and the pools they belong to." actions={<ButtonLink href="/app/demand/new">Create demand</ButtonLink>} />
      <Card className="overflow-hidden pb-3">
        <CardHeader title="Purchasing intents" />
        {intents.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="text-left text-[12.5px] text-muted">
                <th className="px-5 py-3 font-medium">Product</th><th className="px-3 py-3 text-right font-medium">Qty</th><th className="px-3 py-3 text-right font-medium">Max /unit</th>
                <th className="px-3 py-3 font-medium">Delivery</th><th className="px-3 py-3 font-medium">Deadline</th><th className="px-3 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Pool</th>
              </tr></thead>
              <tbody className="num [&>tr:nth-child(odd)]:bg-white/[0.025]">
                {intents.map((i) => {
                  const m = memberships.find((x) => x.intent_id === i.id && x.status === "active");
                  const pool = m ? repo.getPool(db, m.pool_id) : undefined;
                  return (
                    <tr key={i.id}>
                      <td className="px-5 py-3">{i.product_name.split(" (")[0]}{i.source === "natural_language" && <Badge tone="info" className="ml-2">NL</Badge>}</td>
                      <td className="px-3 py-3 text-right">{i.quantity}</td>
                      <td className="px-3 py-3 text-right"><Amount cents={i.max_unit_price} stack className="items-end" /></td>
                      <td className="px-3 py-3 text-muted">{i.delivery_location}</td>
                      <td className="px-3 py-3 text-muted">{shortDate(i.delivery_deadline)}</td>
                      <td className="px-3 py-3"><Badge tone={i.status === "pooled" ? "good" : "neutral"}>{i.status}</Badge></td>
                      <td className="px-5 py-3">{pool ? <Link href={`/app/pools/${pool.id}`} className="inline-flex items-center gap-2 hover:underline"><PoolStatus status={pool.status} /></Link> : <Link href="/app/pools" className="text-[13px] text-lime hover:underline">Find a pool</Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<ShoppingBag className="size-4" />} title="No purchasing intents yet" body="Create one to start pooling demand with other buyers." action={<ButtonLink href="/app/demand/new" size="sm">Create demand</ButtonLink>} />
        )}
      </Card>
    </Rise>
  );
}
