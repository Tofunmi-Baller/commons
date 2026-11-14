import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDb } from "@/lib/db";
import { DEMO_USERS } from "@/lib/demo/fixtures";
import { signInDemoAction } from "@/app/actions";
import { Card } from "@/components/ui";
import { Logo } from "@/components/shell/logo";
import { Amount } from "@/components/price";
import { Stagger, Item, WordRise } from "@/components/motion";
import { AccountForms } from "./forms";

export const dynamic = "force-dynamic";

const FIELDS = ["bg-lime", "bg-sky", "bg-tangerine"];

export default function Login() {
  getDb(); // ensure the database and demo personas exist
  return (
    <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1.15fr_1fr]">
      <div>
        <Link href="/"><Logo className="text-[17px]" /></Link>
        <h1 className="mt-12 font-display text-[clamp(44px,6vw,76px)] font-semibold leading-[0.92] tracking-[-0.05em]">
          <WordRise text="Pick a business." />
        </h1>
        <p className="mt-5 max-w-md text-[17px] leading-relaxed text-paper/80">Three fictional New York businesses share one carton pool. Sign in as any of them and switch at any time. Each one approves the deal for itself.</p>
        <Stagger onMount className="mt-8 space-y-3" delay={0.3}>
          {DEMO_USERS.map((u, i) => (
            <Item key={u.id}>
              <form action={signInDemoAction}>
                <input type="hidden" name="persona" value={u.id} />
                <button className={`group flex w-full items-center justify-between gap-4 rounded-[22px] ${FIELDS[i]} px-6 py-5 text-left text-ink transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-1 hover:rotate-[-0.6deg]`}>
                  <span>
                    <span className="block font-display text-[24px] font-semibold leading-tight tracking-tight">{u.businessName}</span>
                    <span className="num mt-1 block text-[13.5px] text-ink/70">{u.fullName} · {u.location.split(",")[0]} · {u.quantity.toLocaleString()} cartons · max <Amount cents={Math.round(u.maxUnit * 100)} usdClassName="text-ink/55" /></span>
                  </span>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-paper transition-transform duration-500 group-hover:translate-x-1"><ArrowRight className="size-4" /></span>
                </button>
              </form>
            </Item>
          ))}
        </Stagger>
      </div>
      <Card className="p-7 sm:p-9">
        <h2 className="mb-6 font-display text-2xl font-semibold tracking-tight">Or use your own account</h2>
        <AccountForms />
      </Card>
    </div>
  );
}
