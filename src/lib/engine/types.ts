import type { Cents } from "./money";

/** A participant's purchasing intent, normalised for the engine. */
export interface EngineIntent {
  id: string;
  participantId: string;
  participantLabel: string;
  productKey: string;
  productName: string;
  quantity: number;
  minQuantity: number;
  maxUnitPrice: Cents;
  /** State-level delivery region used for geographic compatibility, e.g. "Lagos". */
  deliveryRegion: string;
  deliveryLocation: string;
  /** ISO date (YYYY-MM-DD) by which goods must arrive. */
  deliveryDeadline: string;
  preferredSupplierId: string | null;
  acceptableAlternatives: string[];
  partialOk: boolean;
  requireVerifiedSupplier: boolean;
}

export interface PriceTier {
  minQuantity: number;
  unitPrice: Cents;
}

export interface EngineOffer {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierVerified: boolean;
  productKey: string;
  productName: string;
  tiers: PriceTier[];
  minimumOrderQuantity: number;
  availableQuantity: number;
  /** Flat delivery charge for one consolidated drop in a served region. */
  deliveryCost: Cents;
  deliveryDays: number;
  servesRegions: string[];
  sourceType: "sample" | "supplier_submitted";
}

export interface Violation {
  code:
    | "BUDGET_EXCEEDED"
    | "BELOW_MOQ"
    | "INSUFFICIENT_STOCK"
    | "DEADLINE_MISSED"
    | "REGION_NOT_SERVED"
    | "PRODUCT_MISMATCH"
    | "UNVERIFIED_SUPPLIER"
    | "ALLOCATION_OUT_OF_RANGE"
    | "ARITHMETIC_MISMATCH"
    | "SUSPICIOUS_OFFER"
    | "HASH_MISMATCH"
    | "EMPTY_GROUP";
  participantId?: string;
  message: string;
}

export interface Allocation {
  participantId: string;
  participantLabel: string;
  intentId: string;
  requestedQuantity: number;
  allocatedQuantity: number;
  maxUnitPrice: Cents;
  goodsCost: Cents;
  deliveryShare: Cents;
  contribution: Cents;
  /** Maximum the participant agreed to pay for their allocation (qty × max unit price). */
  maxAllowed: Cents;
  /** Best price this participant could get buying alone from the same offer catalog. Null when no solo option exists. */
  baselineCost: Cents | null;
  baselineOfferId: string | null;
  savings: Cents | null;
  withinBudget: boolean;
}

export interface Evaluation {
  offerId: string;
  supplierName: string;
  productKey: string;
  totalQuantity: number;
  unitPrice: Cents | null;
  deliveryCost: Cents;
  goodsTotal: Cents;
  totalCost: Cents;
  allocations: Allocation[];
  violations: Violation[];
  warnings: Violation[];
  feasible: boolean;
  totalSavings: Cents | null;
  explanation: string[];
}
