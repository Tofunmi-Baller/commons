import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "@/lib/db/index";
import * as repo from "@/lib/db/repo";
import { createIntent, decide, joinPool, matchIntent, negotiate, startPool, withdraw, UserFacingError } from "@/lib/services/pools";
import { resetDemo } from "@/lib/demo/seed";
import { addDays, todayISO } from "@/lib/util";

let db: DatabaseSync;
const demoPool = () => repo.listPools(db, "usr_demo_a").find((p) => p.id.startsWith("pool_demo"))!;
const A = "usr_demo_a", B = "usr_demo_b", C = "usr_demo_c";

beforeEach(() => {
  db = openDb(":memory:");
});

describe("purchasing intents", () => {
  it("creates a validated intent and matches it to the compatible demo pool", () => {
    db.prepare("INSERT INTO users (id, email, full_name) VALUES ('u1','u1@x.com','U One')").run();
    const { id, productKey, region } = createIntent(db, "u1", {
      productName: "Packaging cartons", category: "Packaging", quantity: 800, maxUnitPrice: "2.05",
      deliveryLocation: "Williamsburg, Brooklyn", deliveryDeadline: addDays(todayISO(), 20),
    });
    expect(productKey).toBe("carton-medium");
    expect(region).toBe("New York");
    const m = matchIntent(db, "u1", id);
    expect(m.poolMatches.find((p) => p.poolId === demoPool().id)?.compatible).toBe(true);
    expect(m.offers.filter((o) => o.compatible).map((o) => o.offerId)).toEqual(expect.arrayContaining(["off_apex_carton", "off_hudson_carton"]));
    expect(m.offers.find((o) => o.offerId === "off_pacific_carton")?.compatible).toBe(false);
  });

  it("rejects invalid input and other users' intents", () => {
    db.prepare("INSERT INTO users (id, email, full_name) VALUES ('u1','u1@x.com','U One')").run();
    expect(() => createIntent(db, "u1", { productName: "x", category: "P", quantity: 0, maxUnitPrice: "1", deliveryLocation: "Brooklyn", deliveryDeadline: "2030-01-01" })).toThrow();
    expect(() => createIntent(db, "u1", { productName: "Olive oil", category: "Groceries", quantity: 5, maxUnitPrice: "abc", deliveryLocation: "Berlin", deliveryDeadline: "2030-01-01" })).toThrow(UserFacingError);
    expect(() => createIntent(db, "u1", { productName: "Olive oil", category: "Groceries", quantity: 5, maxUnitPrice: "100", deliveryLocation: "Atlantis", deliveryDeadline: "2030-01-01" })).toThrow(/recognise/);
    const own = repo.intentsForUser(db, A)[0];
    expect(() => matchIntent(db, "u1", own.id)).toThrow(repo.AuthorizationError);
  });
});

describe("demo negotiation flow", () => {
  it("rejects Proposal A for B's budget, approves revised Proposal B, and logs every agent step", () => {
    const pool = demoPool();
    const result = negotiate(db, A, pool.id);
    const proposals = repo.poolProposals(db, pool.id);
    expect(proposals.map((p) => [p.label, p.supplier_offer_id, p.proposal_status])).toEqual([
      ["Proposal A", "off_apex_carton", "rejected_by_guardian"],
      ["Proposal B", "off_hudson_carton", "approved_by_guardian"],
    ]);
    expect(result.approvedProposalId).toBe(proposals[1].id);
    const agents = repo.poolAgentRuns(db, pool.id).map((r) => `${r.agent_type}:${r.status}`);
    expect(agents).toEqual([
      "coordination:succeeded",
      "demand_intelligence:succeeded",
      "supplier_intelligence:succeeded",
      "negotiation:succeeded",
      "financial_guardian:rejected",
      "negotiation:succeeded",
      "financial_guardian:succeeded",
      "coordination:succeeded",
    ]);
    expect(repo.getPool(db, pool.id)!.status).toBe("awaiting_approval");
  });

  it("requires every participant's explicit approval of the exact hash", () => {
    const pool = demoPool();
    negotiate(db, A, pool.id);
    const p = repo.currentProposal(db, pool.id)!;
    expect(() => decide(db, A, p.id, "approved", "wrong-hash")).toThrow(/changed/);
    expect(() => decide(db, "usr_nobody", p.id, "approved", p.proposal_hash)).toThrow(repo.AuthorizationError);
    expect(decide(db, A, p.id, "approved", p.proposal_hash).complete).toBe(false);
    expect(() => decide(db, A, p.id, "approved", p.proposal_hash)).toThrow(/already/);
    decide(db, B, p.id, "approved", p.proposal_hash);
    expect(repo.getPool(db, pool.id)!.status).toBe("awaiting_approval");
    expect(decide(db, C, p.id, "approved", p.proposal_hash).complete).toBe(true);
    expect(repo.getProposal(db, p.id)!.proposal_status).toBe("fully_approved");
    expect(repo.getPool(db, pool.id)!.status).toBe("approved");
    const offchain = repo.transactionsForUser(db, A).filter((t) => t.network === "offchain" && t.pool_id === pool.id);
    expect(offchain).toHaveLength(3);
    expect(offchain.every((t) => t.transaction_hash === null)).toBe(true);
  });

  it("a rejection blocks the proposal", () => {
    const pool = demoPool();
    negotiate(db, A, pool.id);
    const p = repo.currentProposal(db, pool.id)!;
    decide(db, B, p.id, "rejected", p.proposal_hash);
    expect(repo.getProposal(db, p.id)!.proposal_status).toBe("participant_rejected");
    expect(() => decide(db, C, p.id, "approved", p.proposal_hash)).toThrow(/no longer open/);
  });

  it("withdrawal recalculates and never carries old approvals to new terms", () => {
    const pool = demoPool();
    negotiate(db, A, pool.id);
    const first = repo.currentProposal(db, pool.id)!;
    decide(db, A, first.id, "approved", first.proposal_hash);
    withdraw(db, B, pool.id);
    expect(repo.getProposal(db, first.id)!.proposal_status).toBe("superseded");
    const after = repo.currentProposal(db, pool.id);
    if (after) {
      expect(after.proposal_hash).not.toBe(first.proposal_hash);
      expect(repo.proposalApprovals(db, after.id)).toHaveLength(0);
    } else {
      expect(repo.getPool(db, pool.id)!.status).toBe("forming");
    }
  });

  it("a new joiner can start or join pools; demo reset restores a clean state", () => {
    db.prepare("INSERT INTO users (id, email, full_name) VALUES ('u1','u1@x.com','U One')").run();
    const { id } = createIntent(db, "u1", { productName: "cartons", category: "Packaging", quantity: 500, maxUnitPrice: "2.40", deliveryLocation: "Harlem", deliveryDeadline: addDays(todayISO(), 20) });
    joinPool(db, "u1", demoPool().id, id);
    expect(() => joinPool(db, "u1", demoPool().id, id)).toThrow();
    expect(repo.activeParticipants(db, demoPool().id)).toHaveLength(4);
    const { id: id2 } = createIntent(db, "u1", { productName: "Olive oil", category: "Groceries", quantity: 10, maxUnitPrice: "45", deliveryLocation: "Shoreditch", deliveryDeadline: addDays(todayISO(), 20) });
    const own = startPool(db, "u1", id2);
    expect(repo.activeParticipants(db, own)).toHaveLength(1);
    resetDemo(db);
    expect(repo.listPools(db, A).filter((p) => p.is_demo).length).toBe(7);
    const fresh = demoPool();
    expect(repo.activeParticipants(db, fresh.id)).toHaveLength(3);
    expect(repo.poolProposals(db, fresh.id)).toHaveLength(0);
    expect(repo.intentsForUser(db, "u1").find((i) => i.id === id)!.status).toBe("open");
  });
});

describe("seeded demo network", () => {
  it("contains executed history across cities without fabricated on-chain records", () => {
    const pools = repo.listPools(db, A);
    expect(pools.length).toBe(7);
    expect(new Set(pools.map((p) => p.delivery_region))).toEqual(new Set(["New York", "Berlin", "London", "Singapore", "Toronto"]));
    expect(pools.filter((p) => p.status === "approved").length).toBe(1);
    expect(pools.filter((p) => p.status === "awaiting_approval").length).toBe(3);
    const all = db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE transaction_hash IS NOT NULL").get() as { n: number };
    expect(all.n).toBe(0);
    expect(repo.agentRunsForUser(db, A).length).toBeGreaterThan(5);
  });
});
