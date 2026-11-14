/**
 * Live NEAR/USD reference rate for DISPLAY ONLY. All deal maths stays in integer
 * US cents; NEAR figures are a conversion at this rate. Source: CoinGecko public
 * API, cached for 60 s. No user data is sent.
 */
export interface NearPrice {
  usd: number;
  change24h: number | null;
  fetchedAt: string;
  source: "coingecko";
}

type G = typeof globalThis & { __nearPrice?: NearPrice; __nearPriceAt?: number };
const TTL_MS = 60_000;

export async function getNearPrice(): Promise<NearPrice | null> {
  const g = globalThis as G;
  if (g.__nearPrice && Date.now() - (g.__nearPriceAt ?? 0) < TTL_MS) return g.__nearPrice;
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd&include_24hr_change=true", {
      headers: { accept: "application/json", "user-agent": "commons-app" },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { near?: { usd?: number; usd_24h_change?: number } };
    const usd = body.near?.usd;
    if (!usd || !Number.isFinite(usd) || usd <= 0) throw new Error("bad payload");
    g.__nearPrice = { usd, change24h: body.near?.usd_24h_change ?? null, fetchedAt: new Date().toISOString(), source: "coingecko" };
    g.__nearPriceAt = Date.now();
  } catch {
    // Keep serving the last good rate if we have one; otherwise the UI shows USD only.
    g.__nearPriceAt = Date.now() - TTL_MS + 15_000;
  }
  return g.__nearPrice ?? null;
}
