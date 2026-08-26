import { DYE_BY_ID } from "../data/seed.js";
import { ExactDecimal, sumDecimals } from "./decimal.js";
import { DomainError } from "./errors.js";

function parseRatio(value, fieldPath) {
  let ratio;
  try {
    ratio = ExactDecimal.parse(value, { allowNegative: false });
  } catch {
    throw new DomainError("INVALID_DECIMAL", "Enter a valid decimal ratio.", fieldPath);
  }
  if (ratio.compare(ExactDecimal.ONE) > 0) {
    throw new DomainError("INVALID_RATIO", "A component ratio cannot exceed 1.", fieldPath);
  }
  return ratio;
}

export function validateFixedComponents(components) {
  if (!Array.isArray(components) || components.length === 0) {
    throw new DomainError("INVALID_RATIO_SUM", "Add at least one dye component.", "components");
  }

  const seen = new Set();
  const parsed = components.map((component, index) => {
    const fieldPath = `components[${index}]`;
    if (!DYE_BY_ID.has(component.dyeId)) {
      throw new DomainError("REFERENCE_NOT_FOUND", "Select a known dye.", `${fieldPath}.dyeId`);
    }
    if (seen.has(component.dyeId)) {
      throw new DomainError(
        "DUPLICATE_DYE_COMPONENT",
        `${DYE_BY_ID.get(component.dyeId).displayName} appears more than once.`,
        `${fieldPath}.dyeId`,
      );
    }
    seen.add(component.dyeId);
    return {
      dyeId: component.dyeId,
      ratio: parseRatio(component.ratio, `${fieldPath}.ratio`),
    };
  });

  if (!sumDecimals(parsed.map((component) => component.ratio)).equals(ExactDecimal.ONE)) {
    throw new DomainError(
      "INVALID_RATIO_SUM",
      "Dye component ratios must total exactly 100%.",
      "components",
    );
  }

  return parsed;
}

export function resolveTemplate(template, variableRatio = null) {
  if (!template) {
    throw new DomainError("REFERENCE_NOT_FOUND", "Formula template was not found.", "templateId");
  }
  if (template.kind === "fixed") {
    return validateFixedComponents(template.components);
  }
  if (template.kind !== "bounded_complement") {
    throw new DomainError("INVALID_RANGE_SELECTION", "Unsupported formula constraint.", "template.kind");
  }

  const minimum = ExactDecimal.parse(template.variableMinRatio);
  const maximum = ExactDecimal.parse(template.variableMaxRatio);
  const selected = variableRatio === null || variableRatio === undefined || variableRatio === ""
    ? minimum.add(maximum).divide(ExactDecimal.fromInteger(2))
    : parseRatio(variableRatio, "variableRatio");

  if (selected.compare(minimum) < 0 || selected.compare(maximum) > 0) {
    throw new DomainError(
      "INVALID_RANGE_SELECTION",
      `Selection must be between ${minimum.multiply(100).toSignificant()}% and ${maximum.multiply(100).toSignificant()}%.`,
      "variableRatio",
    );
  }

  const complement = ExactDecimal.parse(template.complementTotalRatio);
  const derived = complement.subtract(selected);
  if (derived.compare(ExactDecimal.ZERO) < 0 || derived.compare(ExactDecimal.ONE) > 0) {
    throw new DomainError("INVALID_RANGE_SELECTION", "Derived ratio is outside its valid range.", "variableRatio");
  }

  return validateFixedComponents([
    { dyeId: template.variableDyeId, ratio: selected.toSignificant() },
    { dyeId: template.derivedDyeId, ratio: derived.toSignificant() },
    ...template.fixedComponents,
  ]);
}

export function midpointPercent(template) {
  if (template.kind !== "bounded_complement") return null;
  return ExactDecimal.parse(template.variableMinRatio)
    .add(ExactDecimal.parse(template.variableMaxRatio))
    .divide(ExactDecimal.fromInteger(2))
    .multiply(ExactDecimal.ONE_HUNDRED)
    .toSignificant();
}
