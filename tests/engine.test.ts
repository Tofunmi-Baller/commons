import { describe, expect, it } from "vitest";
import { allocateProportionally, basisPoints, formatNear, formatUSD, dollarsToCents } from "@/lib/engine/money";
import { compile, evaluateCombination, planQuantities, soloBaseline, tierPrice } from "@/lib/engine/compiler";
import { approvalStatus, settlementEligibility, validateProposal } from "@/lib/engine/guardian";
import { hashTerms, termsFromEvaluation } from "@/lib/engine/proposal";
import { DEMO_OFFERS, DEMO_PRODUCT, DEMO_USERS } from "@/lib/demo/fixtures";
import type { EngineIntent } from "@/lib/engine/types";

const TODAY = "2026-11-13";
const intents: EngineIntent[] = DEMO_USERS.map((u) => ({
  id: `int_${u.id}`,
  participantId: u.id,
  participantLabel: u.label,
  productKey: DEMO_PRODUCT.key,
  productName: DEMO_PRODUCT.name,
  quantity: u.quantity,
  minQuantity: u.quantity,
  maxUnitPrice: Math.round(u.maxUnit * 100),
  deliveryRegion: "New York",
  deliveryLocation: u.location,
  deliveryDeadline: "2026-11-27",
  preferredSupplierId: null,
  acceptableAlternatives: [],
  partialOk: false,
  requireVerifiedSupplier: false,
}));
const [A, B, C] = intents;
const apex = DEMO_OFFERS.find((o) => o.id === "off_apex_carton")!;
const lbc = DEMO_OFFERS.find((o) => o.id === "off_hudson_carton")!;

describe("money", () => {
  it("parses dollars to cents without float drift", () => {
    expect(dollarsToCents("1,250.50")).toBe(125050);
    expect(dollarsToCents("$1.86")).toBe(186);
    expect(dollarsToCents(0.1 + 0.2 === 0.3 ? "1" : "0.30")).toBe(30);
    expect(() => dollarsToCents("12.345")).toThrow();
    expect(() => dollarsToCents("-5")).toThrow();
  });
  it("allocates proportionally and conserves every kobo", () => {
    const parts = allocateProportionally(100, [1, 1, 1]);
    expect(parts).toEqual([34, 33, 33]);
    const d = allocateProportionally(4500000, [100, 200, 150]);
    expect(d).toEqual([1000000, 2000000, 1500000]);
    const odd = allocateProportionally(1000001, [7, 13, 29]);
    expect(odd.reduce((a, b) => a + b, 0)).toBe(1000001);
  });
  it("computes basis points and formats naira", () => {
    expect(basisPoints(1, 3)).toBe(3333);
    expect(formatUSD(9500000)).toBe("$95,000");
    expect(formatUSD(12345)).toBe("$123.45");
    expect(formatNear(33800, 3.38)).toBe("100.0 NEAR");
    expect(formatNear(186, 3.38)).toBe("0.550 NEAR");
  });
});

describe("demand compiler", () => {
  it("selects the highest applicable price tier", () => {
    expect(tierPrice(apex, 999)).toBeNull();
    expect(tierPrice(apex, 2999)).toBe(220);
    expect(tierPrice(apex, 4500)).toBe(180);
  });

  it("aggregates quantity across the group", () => {
    const ev = evaluateCombination(lbc, intents, DEMO_OFFERS, TODAY);
    expect(ev.totalQuantity).toBe(4500);
  });

  it("rejects the headline-cheapest offer because B's landed cost exceeds $1.90/unit", () => {
    const ev = evaluateCombination(apex, intents, DEMO_OFFERS, TODAY);
    expect(ev.unitPrice).toBe(180);
    expect(ev.feasible).toBe(false);
    const budget = ev.violations.filter((v) => v.code === "BUDGET_EXCEEDED");
    expect(budget.map((v) => v.participantId)).toEqual(["usr_demo_b"]);
    const b = ev.allocations.find((a) => a.participantId === "usr_demo_b")!;
    expect(b.contribution).toBe(400000); // $4,000 vs $3,800 limit
  });

  it("finds the compliant Hudson Box Co. deal with exact contributions", () => {
    const ev = evaluateCombination(lbc, intents, DEMO_OFFERS, TODAY);
    expect(ev.feasible).toBe(true);
    expect(ev.unitPrice).toBe(186);
    expect(ev.allocations.map((a) => a.contribution)).toEqual([189000, 378000, 283500]);
    expect(ev.totalCost).toBe(850500);
    expect(ev.allocations.reduce((s, a) => s + a.contribution, 0)).toBe(ev.totalCost);
  });

  it("computes savings only against a legitimate solo baseline", () => {
    expect(soloBaseline(A, DEMO_OFFERS, TODAY)).toEqual({ cost: 310000, offerId: "off_apex_carton" });
    expect(soloBaseline(B, DEMO_OFFERS, TODAY)).toEqual({ cost: 433500, offerId: "off_hudson_carton" });
    const ev = evaluateCombination(lbc, intents, DEMO_OFFERS, TODAY);
    expect(ev.allocations.map((a) => a.savings)).toEqual([121000, 55500, 136500]);
    // A participant with no solo option has no savings figure at all.
    const huge = { ...A, quantity: 50000, minQuantity: 50000 };
    expect(soloBaseline(huge, DEMO_OFFERS, TODAY)).toBeNull();
  });

  it("enforces MOQ, region and deadline compatibility", () => {
    const ipm = DEMO_OFFERS.find((o) => o.id === "off_empire_carton")!;
    expect(evaluateCombination(ipm, intents, DEMO_OFFERS, TODAY).violations.some((v) => v.code === "BELOW_MOQ")).toBe(true);
    const abj = DEMO_OFFERS.find((o) => o.id === "off_pacific_carton")!;
    expect(evaluateCombination(abj, intents, DEMO_OFFERS, TODAY).violations.some((v) => v.code === "REGION_NOT_SERVED")).toBe(true);
    const rushed = { ...A, deliveryDeadline: "2026-11-15" };
    expect(evaluateCombination(lbc, [rushed, B, C], DEMO_OFFERS, TODAY).violations.some((v) => v.code === "DEADLINE_MISSED")).toBe(true);
  });

  it("never aggregates incompatible products", () => {
    const rice = { ...A, productKey: "olive-oil-5l", productName: "Olive oil" };
    const result = compile([rice], DEMO_OFFERS, TODAY);
    expect(result.best).toBeNull();
  });

  it("compile() picks the best feasible combination serving everyone", () => {
    const result = compile(intents, DEMO_OFFERS, TODAY);
    expect(result.best?.offerId).toBe("off_hudson_carton");
    expect(result.best?.allocations).toHaveLength(3);
    expect(result.combinationsEvaluated).toBeGreaterThan(4);
  });

  it("recalculates after a withdrawal", () => {
    const result = compile([A, C], DEMO_OFFERS, TODAY);
    // A + C = 2,500 units: no supplier can serve both within budget; best is whatever is feasible or none.
    for (const ev of result.feasible) expect(ev.violations).toHaveLength(0);
    expect(result.best?.allocations.length ?? 0).toBeLessThan(3);
  });

  it("reduces partial-fulfilment participants when stock is short, never below minimum", () => {
    const p = [{ ...A, partialOk: true, minQuantity: 600 }, B];
    expect(planQuantities(p, 2700)).toEqual([700, 2000]);
    expect(planQuantities(p, 2500)).toBeNull();
  });
});

describe("financial guardian", () => {
  const good = evaluateCombination(lbc, intents, DEMO_OFFERS, TODAY);
  const terms = termsFromEvaluation("pool_x", good);
  const hash = hashTerms(terms);

  it("approves a valid proposal", () => {
    const v = validateProposal(terms, hash, intents, lbc, DEMO_OFFERS, TODAY);
    expect(v.approved).toBe(true);
    expect(v.warnings.some((w) => w.code === "UNVERIFIED_SUPPLIER")).toBe(true);
  });

  it("rejects a budget-violating proposal", () => {
    const bad = termsFromEvaluation("pool_x", evaluateCombination(apex, intents, DEMO_OFFERS, TODAY));
    const v = validateProposal(bad, null, intents, apex, DEMO_OFFERS, TODAY);
    expect(v.approved).toBe(false);
    expect(v.violations.some((x) => x.code === "BUDGET_EXCEEDED" && x.participantId === "usr_demo_b")).toBe(true);
  });

  it("detects tampered contributions and hash mismatch", () => {
    const tampered = { ...terms, allocations: terms.allocations.map((a, i) => (i === 0 ? { ...a, contribution: a.contribution - 100 } : a)) };
    const v = validateProposal(tampered, hash, intents, lbc, DEMO_OFFERS, TODAY);
    expect(v.approved).toBe(false);
    expect(v.violations.map((x) => x.code)).toEqual(expect.arrayContaining(["ARITHMETIC_MISMATCH", "HASH_MISMATCH"]));
  });

  it("flags suspicious offers whose price rises with volume", () => {
    const weird = { ...lbc, tiers: [{ minQuantity: 2000, unitPrice: 180 }, { minQuantity: 4000, unitPrice: 186 }] };
    const ev = evaluateCombination(weird, intents, DEMO_OFFERS, TODAY);
    const v = validateProposal(termsFromEvaluation("p", ev), null, intents, weird, DEMO_OFFERS, TODAY);
    expect(v.violations.some((x) => x.code === "SUSPICIOUS_OFFER")).toBe(true);
  });

  it("hash is order-independent but sensitive to any term", () => {
    const reordered = { ...terms, allocations: [...terms.allocations].reverse() };
    expect(hashTerms(reordered)).toBe(hash);
    expect(hashTerms({ ...terms, unitPrice: terms.unitPrice + 1 })).not.toBe(hash);
  });

  it("requires every participant to approve the current hash", () => {
    const ids = intents.map((i) => i.participantId);
    const approvals = [
      { participantId: ids[0], decision: "approved" as const, proposalHash: hash },
      { participantId: ids[1], decision: "approved" as const, proposalHash: "stale" },
    ];
    const s = approvalStatus(ids, approvals, hash);
    expect(s.complete).toBe(false);
    expect(s.missing).toEqual([ids[1], ids[2]]);
  });

  it("settlement eligibility blocks missing approvals, double settlement and expired deadlines", () => {
    const ids = intents.map((i) => i.participantId);
    const all = ids.map((p) => ({ participantId: p, decision: "approved" as const, proposalHash: hash }));
    const base = { proposalStatus: "fully_approved", guardianApproved: true, participantIds: ids, approvals: all, proposalHash: hash, deadline: "2026-11-27", today: TODAY, alreadySettled: false, cancelled: false };
    expect(settlementEligibility(base).eligible).toBe(true);
    expect(settlementEligibility({ ...base, approvals: all.slice(1) }).eligible).toBe(false);
    expect(settlementEligibility({ ...base, alreadySettled: true }).eligible).toBe(false);
    expect(settlementEligibility({ ...base, today: "2026-12-01" }).eligible).toBe(false);
    expect(settlementEligibility({ ...base, guardianApproved: false }).eligible).toBe(false);
  });
});
