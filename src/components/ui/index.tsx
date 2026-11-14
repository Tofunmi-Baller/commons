import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const buttonVariants = cva(
  "group/btn relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[transform,background-color,color] duration-300 ease-[cubic-bezier(.16,1,.3,1)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-lime text-ink hover:-translate-y-0.5 hover:bg-[#d8ff75]",
        secondary: "bg-white/[0.07] text-paper hover:-translate-y-0.5 hover:bg-white/[0.12]",
        ghost: "text-muted hover:text-paper hover:bg-white/[0.06]",
        danger: "bg-tangerine/15 text-tangerine hover:bg-tangerine/25",
        dark: "bg-ink text-paper hover:-translate-y-0.5 hover:bg-black",
      },
      size: { sm: "h-9 px-4 text-[13px]", md: "h-11 px-5 text-sm", lg: "h-14 px-7 text-[15px]" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type BtnProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;
export function Button({ className, variant, size, ...p }: BtnProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...p} />;
}
export function ButtonLink({ className, variant, size, ...p }: ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--radius-card)] bg-panel", className)} {...p} />;
}
export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-6 pb-2 pt-6", className)}>
      <div>
        <h3 className="font-display text-[19px] font-semibold tracking-[-0.01em] text-paper">{title}</h3>
        {description && <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const badgeTone = {
  neutral: "bg-white/[0.07] text-muted",
  good: "bg-lime/15 text-lime",
  bad: "bg-tangerine/15 text-tangerine",
  warn: "bg-amber/15 text-amber",
  info: "bg-sky/15 text-sky",
} as const;
export type Tone = keyof typeof badgeTone;
export function Badge({ tone = "neutral", className, ...p }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium", badgeTone[tone], className)} {...p} />;
}

export function Stat({ label, value, hint, accent, className }: { label: string; value: ReactNode; hint?: ReactNode; accent?: "lime" | "tangerine" | "sky" | "cream"; className?: string }) {
  const fields = { lime: "bg-lime text-ink", tangerine: "bg-tangerine text-ink", sky: "bg-sky text-ink", cream: "bg-cream text-ink" } as const;
  return (
    <div className={cn("flex min-h-36 flex-col justify-between rounded-[var(--radius-card)] p-6", accent ? fields[accent] : "bg-panel", className)}>
      <p className={cn("text-[13.5px]", accent ? "text-ink/70" : "text-muted")}>{label}</p>
      <div>
        <p className="num font-display text-[34px] font-semibold leading-none tracking-[-0.03em]">{value}</p>
        {hint && <p className={cn("mt-2 text-[12.5px]", accent ? "text-ink/65" : "text-muted")}>{hint}</p>}
      </div>
    </div>
  );
}

export function Progress({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-white/10", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-lime transition-[width] duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-lime/15 text-lime">{icon}</div>
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-4">{eyebrow}</div>}
        <h1 className="font-display text-[38px] font-semibold leading-[1.02] tracking-[-0.035em] text-paper sm:text-[52px]">{title}</h1>
        {description && <div className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, children, error }: { label: string; hint?: string; children: ReactNode; error?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13.5px] font-medium text-paper">{label}</span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-[12.5px] text-muted">{hint}</span>}
      {error && <span className="mt-1.5 block text-[12.5px] text-tangerine">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-2xl bg-white/[0.05] px-4 py-3 text-[15px] text-paper placeholder:text-muted/60 outline-none ring-1 ring-transparent transition focus:bg-white/[0.08] focus:ring-lime/60";

export function DemoTag({ children = "Demo data" }: { children?: ReactNode }) {
  return <Badge tone="warn">{children}</Badge>;
}
