"use client";

import { animate, motion, MotionConfig, useInView, useMotionValue, useTransform, type Variants } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

const EASE = [0.16, 1, 0.3, 1] as const;

export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};

/** Staggers its direct <Item> children into view once. */
export function Stagger({ children, className, delay = 0, gap = 0.08, as = "div", onMount = false }: { children: ReactNode; className?: string; delay?: number; gap?: number; as?: "div" | "ul" | "ol" | "section"; onMount?: boolean }) {
  const C = motion[as];
  const trigger = onMount ? { animate: "show" } : { whileInView: "show", viewport: { once: true, margin: "-60px" } };
  return (
    <C className={className} initial="hidden" {...trigger} variants={{ hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: delay } } }}>
      {children}
    </C>
  );
}

export function Item({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" | "p" | "span" | "h2" | "h3" }) {
  const C = motion[as];
  return <C className={className} variants={riseVariants}>{children}</C>;
}

/** Single block that rises in on load (app screens). */
export function Rise({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE, delay }}>
      {children}
    </motion.div>
  );
}

/** Headline whose words rise one after another. */
export function WordRise({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden>
          <motion.span className="inline-block" initial={{ y: "105%" }} animate={{ y: 0 }} transition={{ duration: 0.9, ease: EASE, delay: delay + i * 0.07 }}>
            {w}{i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** Counts from 0 to `value` when scrolled into view. `format` renders the number. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString("en-US"), className, duration = 1.6 }: { value: number; format?: (n: number) => string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (!inView) return;
    const c = animate(mv, value, { duration, ease: EASE });
    return () => c.stop();
  }, [inView, value, mv, duration]);
  return <motion.span ref={ref} className={className}>{text}</motion.span>;
}

/** Animated horizontal fill bar. */
export function Fill({ value, max, className, barClassName }: { value: number; max: number; className?: string; barClassName?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-white/10 ${className ?? ""}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className={`h-full rounded-full bg-lime ${barClassName ?? ""}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 1.2, ease: EASE, delay: 0.2 }} />
    </div>
  );
}
