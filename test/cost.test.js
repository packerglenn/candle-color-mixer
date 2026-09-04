import test from "node:test";
import assert from "node:assert/strict";
import { calculateBatchCost, normalizePurchaseCost } from "../src/domain/cost.js";

test("purchase price normalizes mass to grams", () => {
  const rate = normalizePurchaseCost({
    price: "31.50",
    quantity: "10",
    unit: "lb",
    unitGroup: "mass",
  });
  assert.equal(rate.baseUnit, "g");
  assert.equal(rate.baseQuantity, "4535.9237");
  assert.equal(rate.costPerBaseUnit, "0.00694456125882364379277367");
});

test("batch cost snapshots priced and missing ingredients separately", () => {
  const rates = new Map([["wax", {
    id: "wax-price-1",
    baseUnit: "g",
    costPerBaseUnit: "0.01",
  }]]);
  const result = calculateBatchCost([
    { materialId: "wax", label: "Wax", quantity: "100", baseUnit: "g" },
    { materialId: "dye-red", fallbackMaterialId: "dye-default", label: "Red dye", quantity: "0.3", baseUnit: "g" },
  ], rates);
  assert.equal(result.total, "1");
  assert.equal(result.complete, false);
  assert.equal(result.unpriced[0].materialId, "dye-red");
});
