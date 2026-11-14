import { requireUser } from "@/lib/auth";
import { NEAR_CONTRACT_ID, NEAR_NETWORK, NEAR_RPC_URL, EXPLORER_ACCOUNT } from "@/lib/near/config";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { WalletButton } from "@/components/near/wallet-button";
import { ResetDemo } from "./reset";
import { Rise } from "@/components/motion";
import { NearTicker } from "@/components/price";

export default async function Settings() {
  const user = await requireUser();
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-3 gap-4 rounded-2xl px-3 py-3 text-[14.5px] odd:bg-white/[0.025]"><dt className="text-muted">{k}</dt><dd className="col-span-2 break-all">{v}</dd></div>
  );
  return (
    <Rise className="space-y-6">
      <PageHeader title="Settings" description="Your profile, your wallet and the demo controls." />
      <Card>
        <CardHeader title="Profile" description={user.is_demo ? "Fictional demo persona." : undefined} />
        <dl className="px-3 pb-4">
          {row("Name", user.full_name)}
          {row("Business", user.business_name ?? "—")}
          {row("Location", user.location ?? "—")}
          {row("Email", user.email)}
        </dl>
      </Card>
      <Card>
        <CardHeader title="NEAR wallet" description="COMMONS never asks for or stores private keys. Your wallet signs every on-chain action." action={<WalletButton />} />
        <dl className="px-3 pb-4">
          {row("Linked account", user.wallet_address ? <a className="text-lime hover:underline" href={EXPLORER_ACCOUNT(user.wallet_address)} target="_blank" rel="noreferrer">{user.wallet_address}</a> : "Not connected")}
          {row("Network", NEAR_NETWORK)}
          {row("Contract", NEAR_CONTRACT_ID ?? "Not configured in this environment")}
          {row("RPC", NEAR_RPC_URL)}
          {row("Display rate", <NearTicker key="t" />)}
        </dl>
      </Card>
      <Card className="bg-amber text-ink">
        <CardHeader title="Demo environment" description="Clears every demo pool, proposal, approval, agent run and off-chain record, then seeds a fresh pool for the three fictional businesses. Earlier testnet transactions stay on NEAR; the new pool gets a new on-chain id." />
        <div className="p-5"><ResetDemo /></div>
      </Card>
    </Rise>
  );
}
