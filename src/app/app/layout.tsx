import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { demoUsers } from "@/lib/db/repo";
import { Sidebar } from "@/components/shell/sidebar";
import { PersonaSwitcher } from "@/components/shell/persona-switcher";
import { WalletProvider } from "@/components/near/wallet-provider";
import { WalletButton } from "@/components/near/wallet-button";
import { signOutAction } from "@/app/actions";
import { DEMO_USERS } from "@/lib/demo/fixtures";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const personas = demoUsers(getDb()).map((u) => ({ id: u.id, label: `${DEMO_USERS.find((d) => d.id === u.id)?.label ?? "Demo"} · ${u.business_name}` }));
  return (
    <WalletProvider linkedAccount={user.wallet_address}>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 bg-ink px-4 sm:px-10">
            <div className="flex min-w-0 items-center gap-3">
              {user.is_demo ? (
                <PersonaSwitcher current={user.id} personas={personas} />
              ) : (
                <span className="truncate text-[13px] text-muted">{user.full_name}{user.business_name ? ` · ${user.business_name}` : ""}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <WalletButton />
              <form action={signOutAction}>
                <button className="hidden h-9 rounded-full px-3 text-[13px] text-muted transition hover:bg-white/5 hover:text-paper sm:block">Sign out</button>
              </form>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-8 sm:px-10 lg:pb-16 lg:pt-10">{children}</main>
        </div>
      </div>
    </WalletProvider>
  );
}
