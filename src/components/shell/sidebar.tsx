"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowLeftRight, Compass, LayoutDashboard, PlusCircle, Settings, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "./logo";
import { NearTicker } from "@/components/price";

export const NAV = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/pools", label: "Discover Pools", icon: Compass },
  { href: "/app/purchases", label: "My Purchases", icon: ShoppingBag },
  { href: "/app/demand/new", label: "Create Demand", icon: PlusCircle },
  { href: "/app/activity", label: "Agent Activity", icon: Activity },
  { href: "/app/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-panel px-4 py-6 lg:flex">
        <Link href="/" className="mb-10 px-3"><Logo className="text-[17px]" /></Link>
        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-full px-4 py-2.5 text-[14.5px] transition-all duration-300", active(href) ? "bg-lime font-medium text-ink" : "text-muted hover:translate-x-1 hover:text-paper")}>
              <Icon className="size-[18px]" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3 rounded-[20px] bg-ink p-4 text-[12.5px] leading-relaxed text-muted">
          <NearTicker className="text-paper" />
          <p>Amounts shown in NEAR at the live rate, with USD alongside. Testnet only; supplier offers are sample data.</p>
        </div>
      </aside>
      <nav className="fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-full bg-panel-2 px-1 py-1.5 lg:hidden">
        {NAV.filter((n) => n.href !== "/app/settings").map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cn("flex flex-col items-center gap-0.5 rounded-full px-2.5 py-1 text-[10px]", active(href) ? "bg-lime text-ink" : "text-muted")}>
            <Icon className="size-[18px]" aria-hidden />
            <span className="max-w-14 truncate">{label.split(" ")[0]}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
