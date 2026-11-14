/**
 * Money is always handled as integer minor units: US cents (1 USD = 100 cents).
 * Floating point is never used for authoritative amounts. NEAR figures shown in
 * the UI are a display conversion at a live market rate (see src/lib/price.ts).
 */

export type Cents = number;

export const CURRENCY = {
  code: "USD",
  symbol: "$",
  minorPerMajor: 100,
} as const;

export function assertCents(value: number, label = "amount"): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer number of minor units, got ${value}`);
  }
  return value;
}

/** Convert a user-entered dollar value ("1,250.50", "$2", 1.86) into cents without float drift. */
export function dollarsToCents(input: string | number): Cents {
  const raw = typeof input === "number" ? input.toString() : input.replace(/[$,\s]|usd/gi, "");
  if (!/^\d+(\.\d{0,2})?$/.test(raw)) {
    throw new Error(`Invalid dollar amount: ${input}`);
  }
  const [whole, frac = ""] = raw.split(".");
  return assertCents(Number(whole) * 100 + Number(frac.padEnd(2, "0")));
}

export function mulCents(unit: Cents, quantity: number): Cents {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error(`Quantity must be a non-negative integer, got ${quantity}`);
  }
  return assertCents(unit * quantity, "product");
}

export function sumCents(values: Cents[]): Cents {
  return assertCents(values.reduce((a, b) => a + b, 0), "sum");
}

/**
 * Split `total` across `weights` proportionally using the largest-remainder method.
 * The parts always sum exactly to `total` — no cent is created or lost.
 * Ties on remainder are broken by input order, so results are deterministic.
 */
export function allocateProportionally(total: Cents, weights: number[]): Cents[] {
  assertCents(total, "total");
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (weightSum <= 0) throw new Error("Allocation weights must sum to a positive number");
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new Error("Allocation weights must be non-negative integers");
  }
  const parts = weights.map((w) => {
    const numerator = BigInt(total) * BigInt(w);
    return { base: Number(numerator / BigInt(weightSum)), remainder: Number(numerator % BigInt(weightSum)) };
  });
  let leftover = total - parts.reduce((a, p) => a + p.base, 0);
  const order = parts.map((p, i) => ({ i, r: p.remainder })).sort((a, b) => b.r - a.r || a.i - b.i);
  const result = parts.map((p) => p.base);
  for (const { i } of order) {
    if (leftover <= 0) break;
    result[i] += 1;
    leftover -= 1;
  }
  return result;
}

/** Percentage in basis points (1% = 100 bps), integer-rounded half up. */
export function basisPoints(part: Cents, whole: Cents): number {
  if (whole <= 0) return 0;
  return Number((BigInt(part) * 10000n * 2n + BigInt(whole)) / (BigInt(whole) * 2n));
}

export function formatUSD(cents: Cents, opts: { decimals?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const showDecimals = opts.decimals ?? (frac !== 0 || whole < 100);
  const body = whole.toLocaleString("en-US") + (showDecimals ? "." + frac.toString().padStart(2, "0") : "");
  return `${negative ? "-" : ""}$${body}`;
}

/** Display-only conversion of cents to NEAR at a given USD/NEAR rate. */
export function formatNear(cents: Cents, usdPerNear: number): string {
  const near = cents / 100 / usdPerNear;
  const abs = Math.abs(near);
  const digits = abs >= 1000 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return `${near.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} NEAR`;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}
