import { ExactDecimal } from "./decimal.js";
import { DomainError } from "./errors.js";

const GRAMS_PER_AVOIRDUPOIS_POUND = ExactDecimal.parse("453.59237");
const MILLILITERS_PER_US_FLUID_OUNCE = ExactDecimal.parse("29.5735295625");

function parsePositive(value, fieldPath, label) {
  let parsed;
  try {
    parsed = ExactDecimal.parse(value, { allowNegative: false });
  } catch {
    throw new DomainError("INVALID_DECIMAL", `Enter a valid ${label}.`, fieldPath);
  }
  if (parsed.compare(ExactDecimal.ZERO) <= 0) {
    throw new DomainError("INVALID_DECIMAL", `${label} must be greater than zero.`, fieldPath);
  }
  return parsed;
}

function canonical(value) {
  return value.toSignificant(24);
}

export function calculateFragranceDose({ basisG, ratioFlOzPerLb }) {
  const basis = parsePositive(basisG, "fragrance.basisG", "fragrance basis");
  const ratio = parsePositive(ratioFlOzPerLb, "fragrance.ratioFlOzPerLb", "fl oz/lb ratio");
  const targetFlOz = basis
    .divide(GRAMS_PER_AVOIRDUPOIS_POUND)
    .multiply(ratio);
  const targetMl = targetFlOz.multiply(MILLILITERS_PER_US_FLUID_OUNCE);

  return Object.freeze({
    basisKind: "wax_plus_additive_mass",
    basisG: canonical(basis),
    ratioFlOzPerLb: canonical(ratio),
    targetFlOz: canonical(targetFlOz),
    targetMl: canonical(targetMl),
  });
}
