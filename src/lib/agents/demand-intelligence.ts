/**
 * Agent 1 — Demand Intelligence.
 *
 * Interprets natural-language purchasing requests into structured intents,
 * normalises product descriptions, and groups compatible demand.
 *
 * Implementation note: this MVP uses a transparent rule-based parser (no LLM).
 * It never invents values: anything it cannot find is returned in `missing`
 * so the UI asks the user.
 */
import { message, type AgentMessage } from "./types";
import { addDays } from "../util";

export interface ParsedIntent {
  productName: string | null;
  productKey: string | null;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  maxUnitPriceUsd: number | null;
  deliveryLocation: string | null;
  deliveryRegion: string | null;
  deliveryDeadline: string | null;
  partialOk: boolean | null;
  conditions: string | null;
}

export interface ParseResult {
  fields: ParsedIntent;
  missing: (keyof ParsedIntent)[];
  questions: string[];
  evidence: Partial<Record<keyof ParsedIntent, string>>;
}

/** Canonical products the network currently knows about. Specific entries first. */
export const PRODUCT_CATALOG: { key: string; name: string; category: string; synonyms: RegExp }[] = [
  { key: "cups-12oz", name: "Compostable coffee cups (12 oz, case of 1,000)", category: "Packaging", synonyms: /\b(coffee cups?|paper cups?|hot cups?|compostable cups?|cups)\b/i },
  { key: "kraft-bags", name: "Kraft paper carrier bags (case of 250)", category: "Packaging", synonyms: /\b(kraft bags?|paper bags?|carrier bags?|shopping bags?|bags)\b/i },
  { key: "labels-roll", name: "Thermal shipping labels (roll of 500)", category: "Packaging", synonyms: /\b(shipping labels?|thermal labels?|labels?)\b/i },
  { key: "copy-paper-ream", name: "Recycled copy paper (500-sheet ream)", category: "Office supplies", synonyms: /\b(copy paper|printer paper|printing paper|a4 paper|paper reams?|reams? of paper)\b/i },
  { key: "olive-oil-5l", name: "Extra virgin olive oil (5 L tin)", category: "Groceries", synonyms: /\b(olive oil|cooking oil|oil)\b/i },
  { key: "carton-medium", name: "Corrugated shipping cartons (medium, 16×12×12 in)", category: "Packaging", synonyms: /\b(cartons?|boxes|box|packaging materials?|corrugated|shipping boxes)\b/i },
];

export const CATEGORIES = ["Packaging", "Groceries", "Office supplies", "Building materials", "Business inventory"];

/** Neighbourhood → metro region for delivery locations we recognise. */
export const LOCATIONS: Record<string, string> = {
  brooklyn: "New York", queens: "New York", manhattan: "New York", bronx: "New York", harlem: "New York", williamsburg: "New York",
  "red hook": "New York", "long island city": "New York", "new york": "New York", nyc: "New York",
  kreuzberg: "Berlin", "neukölln": "Berlin", neukolln: "Berlin", mitte: "Berlin", "prenzlauer berg": "Berlin", friedrichshain: "Berlin", berlin: "Berlin",
  shoreditch: "London", camden: "London", hackney: "London", peckham: "London", islington: "London", brixton: "London", london: "London",
  "tiong bahru": "Singapore", bugis: "Singapore", orchard: "Singapore", jurong: "Singapore", singapore: "Singapore",
  leslieville: "Toronto", "kensington market": "Toronto", "the annex": "Toronto", scarborough: "Toronto", toronto: "Toronto",
  alfama: "Lisbon", "bairro alto": "Lisbon", lisbon: "Lisbon",
};

export function normalizeProduct(text: string): { key: string; name: string; category: string } | null {
  const hit = PRODUCT_CATALOG.find((p) => p.synonyms.test(text));
  return hit ? { key: hit.key, name: hit.name, category: hit.category } : null;
}

export function regionFor(location: string): string | null {
  const l = location.toLowerCase();
  const key = Object.keys(LOCATIONS).sort((a, b) => b.length - a.length).find((k) => l.includes(k));
  return key ? LOCATIONS[key] : null;
}

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1 };

function toNumber(s: string): number | null {
  const clean = s.toLowerCase().replace(/,/g, "").trim();
  if (/^\d+(\.\d+)?k$/.test(clean)) return Math.round(parseFloat(clean) * 1000);
  if (/^\d+(\.\d+)?$/.test(clean)) return Number(clean);
  return WORD_NUMBERS[clean] ?? null;
}

export function parseRequest(text: string, today: string): ParseResult {
  const evidence: ParseResult["evidence"] = {};
  const fields: ParsedIntent = {
    productName: null, productKey: null, category: null, quantity: null, unit: null,
    maxUnitPriceUsd: null, deliveryLocation: null, deliveryRegion: null, deliveryDeadline: null,
    partialOk: null, conditions: null,
  };

  // Price: "$2.00 per carton", "no more than $45 per case", "2 dollars each", "USD 1.90/unit"
  const price = text.match(/(?:\$|\bUSD\s?)\s?(\d[\d,]*(?:\.\d{1,2})?k?)\s*(?:per|\/|each|a)\s*(\w+)?/i)
    ?? text.match(/(\d[\d,]*(?:\.\d{1,2})?k?)\s*(?:dollars?|usd)\s*(?:per|\/|each|a)\s*(\w+)?/i);
  if (price) {
    fields.maxUnitPriceUsd = toNumber(price[1]);
    evidence.maxUnitPriceUsd = price[0].trim();
  }

  // Quantity + unit: "200 cartons", "fifty bags". Skip numbers that are part of the price.
  const priceSpan = price ? [price.index ?? -1, (price.index ?? -1) + price[0].length] : [-1, -1];
  const qtyRe = /\b(\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten)\s+(cartons?|boxes|bags?|units?|pieces?|pcs|kegs?|bottles?|reams?|packs?|crates?|tins?|drums?|litres?|tonnes?|cases?|rolls?|sleeves?)\b/gi;
  for (const m of text.matchAll(qtyRe)) {
    if ((m.index ?? 0) >= priceSpan[0] && (m.index ?? 0) < priceSpan[1]) continue;
    const n = toNumber(m[1]);
    if (n && n > 0) {
      fields.quantity = n;
      fields.unit = m[2].toLowerCase();
      evidence.quantity = m[0];
      break;
    }
  }

  // Product: prefer the phrase after "<qty> <unit> of …"; otherwise match the
  // text with the quantity's unit word removed (so "cartons of oil" is oil).
  const ofPhrase = evidence.quantity ? text.slice(text.indexOf(evidence.quantity) + evidence.quantity.length).match(/^\s+of\s+([^.,;]+)/i)?.[1] : undefined;
  const withoutUnit = evidence.quantity ? text.replace(evidence.quantity, " ") : text;
  const product = (ofPhrase && normalizeProduct(ofPhrase)) || normalizeProduct(withoutUnit.replace(/\bunits?\b/gi, ""));
  if (product) {
    fields.productKey = product.key;
    fields.productName = product.name;
    fields.category = product.category;
    evidence.productName = (ofPhrase ?? withoutUnit).match(PRODUCT_CATALOG.find((p) => p.key === product.key)!.synonyms)?.[0];
  }

  // Location: known Nigerian area or state.
  const loc = Object.keys(LOCATIONS).sort((a, b) => b.length - a.length).find((k) => new RegExp(`(^|[^\\p{L}])${k}($|[^\\p{L}])`, "iu").test(text));
  if (loc) {
    fields.deliveryLocation = loc.replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
    fields.deliveryRegion = LOCATIONS[loc];
    if (fields.deliveryLocation.toLowerCase() !== fields.deliveryRegion.toLowerCase()) fields.deliveryLocation += `, ${fields.deliveryRegion}`;
    if (loc === "nyc") fields.deliveryLocation = "New York";
    evidence.deliveryLocation = loc;
  }

  // Deadline: "within two weeks", "in 10 days", "by 2026-11-30".
  const within = text.match(/\b(?:within|in|next)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a)\s+(days?|weeks?)\b/i);
  const byDate = text.match(/\bby\s+(\d{4}-\d{2}-\d{2})\b/i);
  if (byDate) {
    fields.deliveryDeadline = byDate[1];
    evidence.deliveryDeadline = byDate[0];
  } else if (within) {
    const n = toNumber(within[1]) ?? 0;
    fields.deliveryDeadline = addDays(today, /week/i.test(within[2]) ? n * 7 : n);
    evidence.deliveryDeadline = within[0];
  }

  if (/\b(partial|part of the order|some now)\b/i.test(text)) {
    fields.partialOk = !/\b(no|not|don't|do not)\b[^.]*partial/i.test(text);
    evidence.partialOk = "mentions partial fulfilment";
  }

  const cond = text.match(/\b(must|only|require[sd]?)\b[^.]*\./i);
  if (cond && !/\bpay\b/i.test(cond[0])) fields.conditions = cond[0].trim();

  const essentials: (keyof ParsedIntent)[] = ["productName", "quantity", "maxUnitPriceUsd", "deliveryLocation", "deliveryDeadline"];
  const missing = essentials.filter((k) => fields[k] === null);
  const QUESTIONS: Partial<Record<keyof ParsedIntent, string>> = {
    productName: "Which product do you need? I couldn't match it to a product in the network.",
    quantity: "How many units do you need?",
    maxUnitPriceUsd: "What is the most you will pay per unit (USD)?",
    deliveryLocation: "Where should it be delivered?",
    deliveryDeadline: "When do you need it delivered by?",
  };
  return { fields, missing, questions: missing.map((m) => QUESTIONS[m]!).filter(Boolean), evidence };
}

export function interpretRequest(text: string, today: string): AgentMessage<ParseResult> {
  const started = performance.now();
  const result = parseRequest(text, today);
  const found = 5 - result.missing.length;
  return message("demand_intelligence", "Interpret natural-language purchasing request", started, {
    inputSummary: `Free-text request (${text.length} characters).`,
    output: result,
    outputSummary: result.missing.length
      ? `Extracted ${found} of 5 essential fields. Asking for: ${result.missing.join(", ")}.`
      : "Extracted all 5 essential fields. Awaiting user review before saving.",
    status: result.missing.length ? "needs_input" : "succeeded",
  });
}
