import type { DatabaseSync } from "node:sqlite";
import { addDays, todayISO, tx } from "../util";
import { ALL_OFFERS, DEMO_CROWD, DEMO_PRODUCT, DEMO_SUPPLIERS, DEMO_USERS, PRODUCTS, WORLD_POOLS } from "./fixtures";
import { createIntent, decide, joinPool, negotiate, startPool } from "../services/pools";
import * as repo from "../db/repo";

export const DEMO_POOL_PREFIX = "pool_demo";

/**
 * Seed the demo network. Catalog and users are inserted directly; every pool,
 * negotiation and approval is produced by calling the real services, so all
 * agent runs and records in the demo are genuine executions.
 */
export function seedDemo(db: DatabaseSync) {
  tx(db, () => {
    const supplier = db.prepare("INSERT OR REPLACE INTO suppliers (id, name, location, verification_status) VALUES (?, ?, ?, ?)");
    for (const s of DEMO_SUPPLIERS) supplier.run(s.id, s.name, s.location, s.verification);
    const offer = db.prepare(`INSERT OR REPLACE INTO supplier_offers
      (id, supplier_id, product_key, product_name, category, price_tiers, minimum_order_quantity, available_quantity, delivery_cost, delivery_days, serves_regions, source_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const o of ALL_OFFERS) {
      offer.run(o.id, o.supplierId, o.productKey, o.productName, o.category, JSON.stringify(o.tiers), o.minimumOrderQuantity, o.availableQuantity, o.deliveryCost, o.deliveryDays, JSON.stringify(o.servesRegions), o.sourceType);
    }
    const user = db.prepare("INSERT OR IGNORE INTO users (id, email, full_name, business_name, location, is_demo) VALUES (?, ?, ?, ?, ?, 1)");
    for (const u of DEMO_USERS) user.run(u.id, u.email, u.fullName, u.businessName, u.location);
    for (const u of DEMO_CROWD) user.run(u.id, `${u.id.replace("usr_crowd_", "")}@demo.commons`, u.fullName, u.businessName, u.location);
  });

  const today = todayISO();

  // World pools first, so the story pool is the newest.
  WORLD_POOLS.forEach((wp, i) => {
    const product = PRODUCTS[wp.product];
    let poolId = "";
    wp.members.forEach((m, j) => {
      const { id } = createIntent(db, m.user, {
        productName: product.name, productDescription: product.description, category: product.category,
        quantity: m.qty, maxUnitPrice: m.max.toFixed(2), deliveryLocation: m.location, deliveryDeadline: addDays(today, 16 + i * 3),
      });
      if (j === 0) poolId = startPool(db, m.user, id);
      else joinPool(db, m.user, poolId, id);
    });
    db.prepare("UPDATE purchasing_pools SET is_demo = 1, target_quantity = ?, deadline = ? WHERE id = ?").run(wp.target, addDays(today, 9 + i * 2), poolId);
    if (wp.negotiate) {
      negotiate(db, wp.members[0].user, poolId);
      const proposal = repo.currentProposal(db, poolId);
      if (proposal) for (const u of wp.approvals) decide(db, u, proposal.id, "approved", proposal.proposal_hash);
    }
  });

  // The story pool: three businesses, cartons, not negotiated yet.
  const storyPool = `${DEMO_POOL_PREFIX}_${Date.now().toString(36)}`;
  DEMO_USERS.forEach((u, j) => {
    const { id } = createIntent(db, u.id, {
      productName: DEMO_PRODUCT.name, productDescription: DEMO_PRODUCT.description, category: DEMO_PRODUCT.category,
      quantity: u.quantity, maxUnitPrice: u.maxUnit.toFixed(2), deliveryLocation: u.location, deliveryDeadline: addDays(today, 14),
    });
    if (j === 0) startPool(db, u.id, id, { poolId: storyPool });
    else joinPool(db, u.id, storyPool, id);
  });
  db.prepare("UPDATE purchasing_pools SET is_demo = 1, target_quantity = 4000, deadline = ? WHERE id = ?").run(addDays(today, 10), storyPool);
  repo.audit(db, null, "demo_seeded", "pool", storyPool, "Demo network seeded");
}

/**
 * Remove every demo pool (cascading proposals, approvals, agent runs and
 * transaction records) and demo-user intents, then seed a fresh network.
 * On-chain records from earlier runs remain on NEAR testnet; the new story
 * pool receives a new id so they never collide.
 */
export function resetDemo(db: DatabaseSync) {
  tx(db, () => {
    const demoPools = "SELECT id FROM purchasing_pools WHERE is_demo = 1";
    db.prepare(`DELETE FROM approvals WHERE proposal_id IN (SELECT id FROM proposals WHERE pool_id IN (${demoPools}))`).run();
    db.prepare(`DELETE FROM proposal_allocations WHERE proposal_id IN (SELECT id FROM proposals WHERE pool_id IN (${demoPools}))`).run();
    db.prepare(`DELETE FROM proposals WHERE pool_id IN (${demoPools})`).run();
    db.prepare(`DELETE FROM pool_participants WHERE pool_id IN (${demoPools})`).run();
    db.prepare(`DELETE FROM agent_runs WHERE pool_id IN (${demoPools})`).run();
    db.prepare(`DELETE FROM transactions WHERE pool_id IN (${demoPools})`).run();
    db.prepare("DELETE FROM purchasing_pools WHERE is_demo = 1").run();
    const demoUsers = "SELECT id FROM users WHERE is_demo = 1";
    db.prepare(`DELETE FROM agent_runs WHERE pool_id IS NULL AND user_id IN (${demoUsers})`).run();
    db.prepare(`DELETE FROM pool_participants WHERE intent_id IN (SELECT id FROM purchasing_intents WHERE user_id IN (${demoUsers}))`).run();
    db.prepare(`DELETE FROM purchasing_intents WHERE user_id IN (${demoUsers})`).run();
    // Intents of real users that were in a demo pool become open again.
    db.prepare("UPDATE purchasing_intents SET status = 'open' WHERE status = 'pooled' AND id NOT IN (SELECT intent_id FROM pool_participants)").run();
    db.prepare("INSERT INTO audit_log (action, entity, detail) VALUES ('demo_reset', 'pool', 'All demo pools cleared')").run();
  });
  seedDemo(db);
}
