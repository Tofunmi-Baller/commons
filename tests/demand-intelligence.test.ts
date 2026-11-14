import { describe, expect, it } from "vitest";
import { parseRequest, regionFor } from "@/lib/agents/demand-intelligence";
import { compareSuppliers } from "@/lib/agents/supplier-intelligence";
import { DEMO_OFFERS, DEMO_PRODUCT } from "@/lib/demo/fixtures";

const TODAY = "2026-11-13";

describe("demand intelligence parser", () => {
  it("extracts a packaging request", () => {
    const r = parseRequest("I need 2,000 cartons of packaging materials delivered to Williamsburg within two weeks. I want to pay no more than $2.05 per carton.", TODAY);
    expect(r.fields).toMatchObject({ quantity: 2000, unit: "cartons", maxUnitPriceUsd: 2.05, deliveryRegion: "New York", deliveryLocation: "Williamsburg, New York", deliveryDeadline: "2026-11-27", productKey: "carton-medium" });
    expect(r.missing).toEqual([]);
  });

  it("reads the product after the unit and asks for a missing deadline instead of inventing it", () => {
    const r = parseRequest("I run a small café in Kreuzberg. I need 40 cases of compostable coffee cups, but I cannot spend more than $70 per case.", TODAY);
    expect(r.fields.quantity).toBe(40);
    expect(r.fields.maxUnitPriceUsd).toBe(70);
    expect(r.fields.productKey).toBe("cups-12oz");
    expect(r.fields.deliveryRegion).toBe("Berlin");
    expect(r.fields.deliveryDeadline).toBeNull();
    expect(r.missing).toEqual(["deliveryDeadline"]);
    expect(r.questions[0]).toMatch(/when/i);
  });

  it("does not hallucinate a price or product", () => {
    const r = parseRequest("Need some stuff soon", TODAY);
    expect(r.fields.maxUnitPriceUsd).toBeNull();
    expect(r.fields.productName).toBeNull();
    expect(r.missing.length).toBe(5);
  });

  it("maps neighbourhoods to regions", () => {
    expect(regionFor("Neukölln")).toBe("Berlin");
    expect(regionFor("Tiong Bahru, Singapore")).toBe("Singapore");
    expect(regionFor("Mars")).toBeNull();
  });
});

describe("supplier intelligence", () => {
  it("ranks operationally viable offers by landed total and excludes the rest with reasons", () => {
    const intents = [1000, 2000, 1500].map((q, i) => ({ id: `i${i}`, participantId: `p${i}`, participantLabel: `P${i}`, productKey: DEMO_PRODUCT.key, productName: DEMO_PRODUCT.name, quantity: q, minQuantity: q, maxUnitPrice: 500, deliveryRegion: "New York", deliveryLocation: "New York", deliveryDeadline: "2026-11-27", preferredSupplierId: null, acceptableAlternatives: [], partialOk: false, requireVerifiedSupplier: false }));
    const msg = compareSuppliers(intents, DEMO_OFFERS, TODAY);
    expect(msg.output.filter((o) => o.operationallyViable).map((o) => o.offerId)).toEqual(["off_hudson_carton", "off_apex_carton"]);
    expect(msg.output.find((o) => o.offerId === "off_empire_carton")?.blockers[0]).toMatch(/minimum order/);
  });
});
