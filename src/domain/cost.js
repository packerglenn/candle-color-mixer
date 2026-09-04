import { ExactDecimal, sumDecimals } from "./decimal.js";
import { DomainError } from "./errors.js";

const MASS_UNITS = Object.freeze({
  g: "1",
  kg: "1000",
  oz: "28.349523125",
  lb: "453.59237",
});

const VOLUME_UNITS = Object.freeze({
  ml: "1",
  "fl-oz": "29.5735295625",
});

const COUNT_UNITS = Object.freeze({ each: "1" });

export const UNIT_GROUPS = Object.freeze({
  mass: MASS_UNITS,
  volume: VOLUME_UNITS,
  count: COUNT_UNITS,
});

export function baseUnitFor(group) {
  if (group === "mass") return "g";
  if (group === "volume") return "ml";
  if (group === "count") return "each";
  throw new DomainError("INVALID_UNIT", "Choose a supported material unit.", "unitGroup");
}

export function normalizePurchaseCost({ price, quantity, unit, unitGroup }) {
  let parsedPrice;
  let parsedQuantity;
  try {
    parsedPrice = ExactDecimal.parse(price, { allowNegative: false });
    parsedQuantity = ExactDecimal.parse(quantity, { allowNegative: false });
  } catch {
    throw new DomainError("INVALID_DECIMAL", "Enter a valid purchase price and quantity.", "materialPrice");
  }
  if (parsedPrice.compare(ExactDecimal.ZERO) < 0 || parsedQuantity.compare(ExactDecimal.ZERO) <= 0) {
    throw new DomainError("INVALID_DECIMAL", "Purchase quantity must be greater than zero.", "purchaseQuantity");
  }
  const group = UNIT_GROUPS[unitGroup];
  const factor = group?.[unit];
  if (!factor) {
    throw new DomainError("INVALID_UNIT", "The selected unit does not match this material.", "purchaseUnit");
  }
  const baseQuantity = parsedQuantity.multiply(ExactDecimal.parse(factor));
  return {
    baseUnit: baseUnitFor(unitGroup),
    baseQuantity: baseQuantity.toSignificant(24),
    costPerBaseUnit: parsedPrice.divide(baseQuantity).toSignificant(24),
  };
}

export function calculateBatchCost(lines, ratesByMaterialId) {
  const priced = [];
  const unpriced = [];
  for (const line of lines) {
    const rate = ratesByMaterialId.get(line.materialId)
      ?? (line.fallbackMaterialId ? ratesByMaterialId.get(line.fallbackMaterialId) : null);
    if (!rate) {
      unpriced.push({ ...line });
      continue;
    }
    if (rate.baseUnit !== line.baseUnit) {
      throw new DomainError("INVALID_UNIT", `Price unit for ${line.label} does not match the amount used.`, "costLines");
    }
    const cost = ExactDecimal.parse(line.quantity, { allowNegative: false })
      .multiply(ExactDecimal.parse(rate.costPerBaseUnit, { allowNegative: false }));
    priced.push({
      ...line,
      priceVersionId: rate.id,
      costPerBaseUnit: rate.costPerBaseUnit,
      cost: cost.toSignificant(24),
    });
  }
  return {
    currency: "USD",
    priced,
    unpriced,
    total: sumDecimals(priced.map((line) => ExactDecimal.parse(line.cost))).toSignificant(24),
    complete: unpriced.length === 0,
  };
}
