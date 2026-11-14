/**
 * DEMO DATA — every business, person and supplier below is fictional.
 * Supplier offers are labelled `sourceType: "sample"` everywhere they are shown.
 * Amounts are integer US cents.
 */
import type { EngineOffer } from "../engine/types";

const c = (dollars: number) => Math.round(dollars * 100);

export const PRODUCTS = {
  carton: { key: "carton-medium", name: "Corrugated shipping cartons (medium, 16×12×12 in)", category: "Packaging", description: "Double-wall kraft cartons for shipping baked goods, coffee and apparel." },
  cups: { key: "cups-12oz", name: "Compostable coffee cups (12 oz, case of 1,000)", category: "Packaging", description: "PLA-lined paper hot cups, certified compostable." },
  bags: { key: "kraft-bags", name: "Kraft paper carrier bags (case of 250)", category: "Packaging", description: "Twisted-handle recycled kraft bags, medium." },
  paper: { key: "copy-paper-ream", name: "Recycled copy paper (500-sheet ream)", category: "Office supplies", description: "A4 / Letter, 80 gsm, 100% recycled." },
  oil: { key: "olive-oil-5l", name: "Extra virgin olive oil (5 L tin)", category: "Groceries", description: "Cold-pressed, single-estate, food-service tins." },
  labels: { key: "labels-roll", name: "Thermal shipping labels (roll of 500)", category: "Packaging", description: "4×6 in direct-thermal labels." },
} as const;

export const DEMO_PRODUCT = PRODUCTS.carton;

/** The three personas a judge can sign in as. */
export const DEMO_USERS = [
  { id: "usr_demo_a", label: "Participant A", email: "maya@demo.commons", fullName: "Maya Chen", businessName: "Bloom Bakery", location: "Brooklyn, New York", region: "New York", quantity: 1000, maxUnit: 2.0 },
  { id: "usr_demo_b", label: "Participant B", email: "daniel@demo.commons", fullName: "Daniel Ortiz", businessName: "Ortiz Coffee Roasters", location: "Queens, New York", region: "New York", quantity: 2000, maxUnit: 1.9 },
  { id: "usr_demo_c", label: "Participant C", email: "priya@demo.commons", fullName: "Priya Raman", businessName: "Loom & Thread", location: "Manhattan, New York", region: "New York", quantity: 1500, maxUnit: 2.2 },
] as const;

/** Other fictional network members who populate pools around the world. */
export const DEMO_CROWD = [
  { id: "usr_crowd_ava", fullName: "Ava Thompson", businessName: "Corner Deli", location: "Bronx, New York" },
  { id: "usr_crowd_omar", fullName: "Omar Haddad", businessName: "Haddad Market", location: "Queens, New York" },
  { id: "usr_crowd_lena", fullName: "Lena Hoffmann", businessName: "Kiez Kaffee", location: "Kreuzberg, Berlin" },
  { id: "usr_crowd_jonas", fullName: "Jonas Weber", businessName: "Weber Brot", location: "Neukölln, Berlin" },
  { id: "usr_crowd_tom", fullName: "Tom Fletcher", businessName: "Fletcher & Co. Studio", location: "Shoreditch, London" },
  { id: "usr_crowd_hannah", fullName: "Hannah Clarke", businessName: "Clarke Architects", location: "Camden, London" },
  { id: "usr_crowd_weiling", fullName: "Wei Ling Tan", businessName: "Tan's Kitchen", location: "Tiong Bahru, Singapore" },
  { id: "usr_crowd_arjun", fullName: "Arjun Mehta", businessName: "Spice Route", location: "Bugis, Singapore" },
  { id: "usr_crowd_sofia", fullName: "Sofia Marques", businessName: "Marques Tapas", location: "Orchard, Singapore" },
  { id: "usr_crowd_liam", fullName: "Liam O'Connor", businessName: "Northbound Outfitters", location: "Leslieville, Toronto" },
] as const;

export const DEMO_SUPPLIERS = [
  { id: "sup_apex", name: "Apex Packaging Co.", location: "Newark, NJ" },
  { id: "sup_hudson", name: "Hudson Box Co.", location: "Long Island City, NY" },
  { id: "sup_empire", name: "Empire Paper Mills", location: "Albany, NY" },
  { id: "sup_pacific", name: "Pacific Pack Co.", location: "Vancouver, BC" },
  { id: "sup_greencup", name: "GreenCup Supply", location: "Brooklyn, NY" },
  { id: "sup_brooklyneco", name: "Brooklyn Eco Goods", location: "Red Hook, NY" },
  { id: "sup_liberty", name: "Liberty Bag Works", location: "Paterson, NJ" },
  { id: "sup_spree", name: "Spree Verpackung", location: "Berlin" },
  { id: "sup_thames", name: "Thames Office Supply", location: "London" },
  { id: "sup_straits", name: "Straits Provisions", location: "Singapore" },
  { id: "sup_maple", name: "Maple Label Co.", location: "Mississauga, ON" },
].map((s) => ({ ...s, verification: "unverified" as const }));

type OfferSeed = Omit<EngineOffer, "supplierName" | "supplierVerified" | "productName" | "sourceType"> & { product: keyof typeof PRODUCTS };

const OFFER_SEEDS: OfferSeed[] = [
  // ── The story pool: cartons, New York ─────────────────────────────────
  // Lowest headline price at volume, but expensive delivery.
  { id: "off_apex_carton", supplierId: "sup_apex", product: "carton", productKey: PRODUCTS.carton.key, tiers: [{ minQuantity: 1000, unitPrice: c(2.2) }, { minQuantity: 3000, unitPrice: c(2.0) }, { minQuantity: 4000, unitPrice: c(1.8) }], minimumOrderQuantity: 1000, availableQuantity: 10000, deliveryCost: c(900), deliveryDays: 3, servesRegions: ["New York"] },
  { id: "off_hudson_carton", supplierId: "sup_hudson", product: "carton", productKey: PRODUCTS.carton.key, tiers: [{ minQuantity: 2000, unitPrice: c(2.1) }, { minQuantity: 4000, unitPrice: c(1.86) }], minimumOrderQuantity: 2000, availableQuantity: 6000, deliveryCost: c(135), deliveryDays: 4, servesRegions: ["New York"] },
  { id: "off_empire_carton", supplierId: "sup_empire", product: "carton", productKey: PRODUCTS.carton.key, tiers: [{ minQuantity: 5000, unitPrice: c(1.7) }], minimumOrderQuantity: 5000, availableQuantity: 20000, deliveryCost: c(400), deliveryDays: 5, servesRegions: ["New York"] },
  { id: "off_pacific_carton", supplierId: "sup_pacific", product: "carton", productKey: PRODUCTS.carton.key, tiers: [{ minQuantity: 1000, unitPrice: c(1.96) }, { minQuantity: 3000, unitPrice: c(1.82) }], minimumOrderQuantity: 1000, availableQuantity: 8000, deliveryCost: c(300), deliveryDays: 6, servesRegions: ["Toronto"] },
  // ── Cups, New York ───────────────────────────────────────────────────
  { id: "off_greencup_cups", supplierId: "sup_greencup", product: "cups", productKey: PRODUCTS.cups.key, tiers: [{ minQuantity: 30, unitPrice: c(78) }, { minQuantity: 120, unitPrice: c(66) }], minimumOrderQuantity: 30, availableQuantity: 400, deliveryCost: c(45), deliveryDays: 2, servesRegions: ["New York"] },
  { id: "off_brooklyneco_cups", supplierId: "sup_brooklyneco", product: "cups", productKey: PRODUCTS.cups.key, tiers: [{ minQuantity: 100, unitPrice: c(69) }, { minQuantity: 150, unitPrice: c(63) }], minimumOrderQuantity: 100, availableQuantity: 300, deliveryCost: c(120), deliveryDays: 3, servesRegions: ["New York"] },
  // ── Kraft bags, New York ─────────────────────────────────────────────
  { id: "off_liberty_bags", supplierId: "sup_liberty", product: "bags", productKey: PRODUCTS.bags.key, tiers: [{ minQuantity: 25, unitPrice: c(54) }, { minQuantity: 100, unitPrice: c(46) }], minimumOrderQuantity: 25, availableQuantity: 500, deliveryCost: c(60), deliveryDays: 3, servesRegions: ["New York"] },
  // ── Elsewhere ────────────────────────────────────────────────────────
  { id: "off_spree_cups", supplierId: "sup_spree", product: "cups", productKey: PRODUCTS.cups.key, tiers: [{ minQuantity: 50, unitPrice: c(71) }, { minQuantity: 150, unitPrice: c(62) }], minimumOrderQuantity: 50, availableQuantity: 600, deliveryCost: c(40), deliveryDays: 2, servesRegions: ["Berlin"] },
  { id: "off_thames_paper", supplierId: "sup_thames", product: "paper", productKey: PRODUCTS.paper.key, tiers: [{ minQuantity: 100, unitPrice: c(6.4) }, { minQuantity: 500, unitPrice: c(5.6) }], minimumOrderQuantity: 100, availableQuantity: 3000, deliveryCost: c(35), deliveryDays: 2, servesRegions: ["London"] },
  { id: "off_straits_oil", supplierId: "sup_straits", product: "oil", productKey: PRODUCTS.oil.key, tiers: [{ minQuantity: 20, unitPrice: c(48) }, { minQuantity: 100, unitPrice: c(41) }], minimumOrderQuantity: 20, availableQuantity: 400, deliveryCost: c(55), deliveryDays: 3, servesRegions: ["Singapore"] },
  { id: "off_maple_labels", supplierId: "sup_maple", product: "labels", productKey: PRODUCTS.labels.key, tiers: [{ minQuantity: 50, unitPrice: c(14) }, { minQuantity: 200, unitPrice: c(11.5) }], minimumOrderQuantity: 50, availableQuantity: 2000, deliveryCost: c(25), deliveryDays: 4, servesRegions: ["Toronto"] },
];

const supplierName = (id: string) => DEMO_SUPPLIERS.find((s) => s.id === id)!.name;

export const ALL_OFFERS: (EngineOffer & { category: string })[] = OFFER_SEEDS.map(({ product, ...o }) => ({
  ...o,
  supplierName: supplierName(o.supplierId),
  supplierVerified: false,
  productName: PRODUCTS[product].name,
  category: PRODUCTS[product].category,
  sourceType: "sample" as const,
}));

/** The four carton offers used by the headline story (and its tests). */
export const DEMO_OFFERS: EngineOffer[] = ALL_OFFERS.filter((o) => o.productKey === PRODUCTS.carton.key);

/** Pools seeded around the demo story so the network has real, executed history. */
export const WORLD_POOLS: {
  product: keyof typeof PRODUCTS;
  target: number;
  members: { user: string; qty: number; max: number; location: string }[];
  negotiate: boolean;
  approvals: string[];
}[] = [
  { product: "cups", target: 150, negotiate: true, approvals: ["usr_demo_b", "usr_crowd_ava"],
    members: [{ user: "usr_demo_a", qty: 40, max: 68, location: "Brooklyn, New York" }, { user: "usr_demo_b", qty: 60, max: 70, location: "Queens, New York" }, { user: "usr_crowd_ava", qty: 50, max: 72, location: "Bronx, New York" }] },
  { product: "bags", target: 100, negotiate: true, approvals: ["usr_demo_a", "usr_demo_c", "usr_crowd_omar"],
    members: [{ user: "usr_demo_a", qty: 30, max: 52, location: "Brooklyn, New York" }, { user: "usr_demo_c", qty: 50, max: 50, location: "Manhattan, New York" }, { user: "usr_crowd_omar", qty: 40, max: 55, location: "Queens, New York" }] },
  { product: "cups", target: 150, negotiate: true, approvals: ["usr_crowd_lena"],
    members: [{ user: "usr_crowd_lena", qty: 80, max: 75, location: "Kreuzberg, Berlin" }, { user: "usr_crowd_jonas", qty: 45, max: 72, location: "Neukölln, Berlin" }] },
  { product: "paper", target: 500, negotiate: false, approvals: [],
    members: [{ user: "usr_crowd_tom", qty: 120, max: 6.2, location: "Shoreditch, London" }, { user: "usr_crowd_hannah", qty: 200, max: 6.0, location: "Camden, London" }] },
  { product: "oil", target: 100, negotiate: true, approvals: ["usr_crowd_weiling", "usr_crowd_arjun"],
    members: [{ user: "usr_crowd_weiling", qty: 30, max: 50, location: "Tiong Bahru, Singapore" }, { user: "usr_crowd_arjun", qty: 45, max: 49, location: "Bugis, Singapore" }, { user: "usr_crowd_sofia", qty: 25, max: 52, location: "Orchard, Singapore" }] },
  { product: "labels", target: 200, negotiate: false, approvals: [],
    members: [{ user: "usr_crowd_liam", qty: 60, max: 13, location: "Leslieville, Toronto" }] },
];
