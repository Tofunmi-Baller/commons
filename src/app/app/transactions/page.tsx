import Link from "next/link";
import { ArrowLeftRight, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { transactionsForUser } from "@/lib/db/repo";
import { Amount } from "@/components/price";
import { Rise } from "@/components/motion";
import { EXPLORER_TX } from "@/lib/near/config";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export default async function Transactions() {
  const user = await requireUser();
  const txs = transactionsForUser(getDb(), user.id);
  return (
    <Rise>
      <PageHeader title="Every record, on and off chain" description="Approvals, commitments and settlements for your pools. On-chain entries are verified against NEAR testnet before they appear; off-chain records are labelled and carry no hash." />
      <Card className="overflow-hidden pb-3">
        {txs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="text-left text-[12.5px] text-muted">
                <th className="px-5 py-3 font-medium">When</th><th className="px-3 py-3 font-medium">Record</th><th className="px-3 py-3 font-medium">Pool</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th><th className="px-3 py-3 font-medium">Where</th><th className="px-3 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Hash</th>
              </tr></thead>
              <tbody className="[&>tr:nth-child(odd)]:bg-white/[0.025]">
                {txs.map((t) => (
                  <tr key={t.id}>
                    <td className="num whitespace-nowrap px-5 py-3 text-muted">{new Date(t.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="px-3 py-3"><p>{t.transaction_type.replaceAll("_", " ")}</p><p className="text-[12px] text-muted">{t.detail}</p></td>
                    <td className="px-3 py-3">{t.pool_id ? <Link href={`/app/pools/${t.pool_id}`} className="text-[13px] hover:underline">{t.product_name?.split(" (")[0]}</Link> : "—"}</td>
                    <td className="num px-3 py-3 text-right">{t.amount !== null ? <Amount cents={t.amount} stack className="items-end" /> : "—"}</td>
                    <td className="px-3 py-3">{t.network === "near-testnet" ? <Badge tone="info">NEAR testnet</Badge> : <Badge>off-chain record</Badge>}</td>
                    <td className="px-3 py-3"><Badge tone={t.status === "confirmed" ? "good" : t.status === "failed" ? "bad" : "neutral"}>{t.status}</Badge></td>
                    <td className="px-5 py-3">
                      {t.transaction_hash ? (
                        <a href={EXPLORER_TX(t.transaction_hash)} target="_blank" rel="noreferrer" className="num inline-flex items-center gap-1 text-[13px] text-lime hover:underline">{t.transaction_hash.slice(0, 10)}… <ExternalLink className="size-3" /></a>
                      ) : <span className="text-[12px] text-muted">none (not on-chain)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<ArrowLeftRight className="size-4" />} title="No transactions yet" body="Approvals and NEAR commitments for your pools will appear here." />
        )}
      </Card>
    </Rise>
  );
}
