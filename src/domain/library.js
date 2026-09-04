import { APPLICATION_PRESETS, DYE_BY_ID, FORMULA_TEMPLATES, TEMPLATE_BY_ID } from "../data/seed.js";
import { ExactDecimal, sumDecimals } from "./decimal.js";
import { DomainError } from "./errors.js";
import { resolveTemplate } from "./formula-engine.js";
import { defaultStrengthForWaxType } from "./wax-guidance.js";

export const STARTER_PREFIX = "starter:";

export function starterColorId(templateId) {
  return `${STARTER_PREFIX}${templateId}`;
}

export function starterTemplateId(colorId) {
  return colorId?.startsWith(STARTER_PREFIX) ? colorId.slice(STARTER_PREFIX.length) : null;
}

export function isStarterColor(colorId) {
  return Boolean(starterTemplateId(colorId));
}

export function resolvedTemplateComponents(templateId) {
  const template = TEMPLATE_BY_ID.get(templateId);
  if (!template) {
    throw new DomainError("REFERENCE_NOT_FOUND", "Starter formula was not found.", "templateId");
  }
  return resolveTemplate(template).map((component) => ({
    dyeId: component.dyeId,
    ratio: component.ratio.toSignificant(),
  }));
}

export function starterColors() {
  const defaultStrength = defaultStrengthForWaxType(APPLICATION_PRESETS.defaultWaxTypeId);
  if (!defaultStrength) {
    throw new DomainError("REFERENCE_NOT_FOUND", "Default decorative-wax dye tier was not found.", "defaultDyeStrengthId");
  }
  return FORMULA_TEMPLATES.map((template) => ({
    schemaVersion: 1,
    id: starterColorId(template.id),
    kind: "starter",
    name: template.displayName,
    screenHex: template.screenAnchorHex,
    status: "untested",
    templateId: template.id,
    currentRecipeVersion: 1,
    recipe: {
      schemaVersion: 1,
      id: `${starterColorId(template.id)}:v1`,
      colorId: starterColorId(template.id),
      version: 1,
      sourceType: template.sourceType ?? "manufacturer",
      verificationStatus: template.verificationStatus ?? "untested",
      derivedFromTemplateId: template.id,
      waxTypeId: APPLICATION_PRESETS.defaultWaxTypeId,
      dyeLoadPct: defaultStrength.pureDyeLoadPct,
      components: resolvedTemplateComponents(template.id),
      additive: null,
      fragrance: null,
      notes: template.notes ?? "Starter ratio scaled with the color kit’s paraffin dosage. Test the cured result, then record any adjustment you make.",
    },
  }));
}

export function deriveActualRecipe({ baseWaxActualG, dyeActuals }) {
  let baseWax;
  try {
    baseWax = ExactDecimal.parse(baseWaxActualG, { allowNegative: false });
  } catch {
    throw new DomainError("INVALID_DECIMAL", "Enter the actual base-wax amount in grams.", "baseWaxActualG");
  }
  if (baseWax.compare(ExactDecimal.ZERO) <= 0) {
    throw new DomainError("INVALID_DECIMAL", "Actual base wax must be greater than zero.", "baseWaxActualG");
  }
  if (!Array.isArray(dyeActuals) || dyeActuals.length === 0) {
    throw new DomainError("INVALID_RATIO_SUM", "Record at least one dye amount.", "dyeActuals");
  }

  const seen = new Set();
  const parsed = dyeActuals.map((item, index) => {
    if (!DYE_BY_ID.has(item.dyeId)) {
      throw new DomainError("REFERENCE_NOT_FOUND", "Select a known dye.", `dyeActuals[${index}].dyeId`);
    }
    if (seen.has(item.dyeId)) {
      throw new DomainError("DUPLICATE_DYE_COMPONENT", "Each dye can appear only once.", `dyeActuals[${index}].dyeId`);
    }
    seen.add(item.dyeId);
    let actual;
    try {
      actual = ExactDecimal.parse(item.actualG, { allowNegative: false });
    } catch {
      throw new DomainError("INVALID_DECIMAL", "Enter a valid actual dye amount.", `dyeActuals[${index}].actualG`);
    }
    return { dyeId: item.dyeId, actual };
  });

  const used = parsed.filter((item) => item.actual.compare(ExactDecimal.ZERO) > 0);
  const total = sumDecimals(used.map((item) => item.actual));
  if (total.isZero()) {
    throw new DomainError("INVALID_RATIO_SUM", "Actual dye must be greater than zero to save a color formula.", "dyeActuals");
  }

  const components = [];
  let assignedRatio = ExactDecimal.ZERO;
  used.forEach((item, index) => {
    const ratio = index === used.length - 1
      ? ExactDecimal.ONE.subtract(assignedRatio)
      : ExactDecimal.parse(item.actual.divide(total).toSignificant(24));
    assignedRatio = assignedRatio.add(ratio);
    components.push({ dyeId: item.dyeId, ratio: ratio.toSignificant(24) });
  });

  return {
    pureDyeTotalG: total.toSignificant(24),
    dyeLoadPct: total.divide(baseWax).multiply(100).toSignificant(24),
    components,
  };
}

export function recipeFormulaSummary(recipe) {
  return recipe.components.map((component) => {
    const dye = DYE_BY_ID.get(component.dyeId);
    const percent = ExactDecimal.parse(component.ratio).multiply(100).toSignificant();
    return `${dye?.displayName ?? "Unknown dye"} ${percent}%`;
  }).join(" · ");
}

export function recipeChanged(plannedRecipe, actualRecipe) {
  if (plannedRecipe.waxTypeId && actualRecipe.waxTypeId && plannedRecipe.waxTypeId !== actualRecipe.waxTypeId) return true;
  if (ExactDecimal.parse(plannedRecipe.dyeLoadPct).compare(actualRecipe.dyeLoadPct) !== 0) return true;
  if (plannedRecipe.components.length !== actualRecipe.components.length) return true;
  return plannedRecipe.components.some((component, index) => {
    const actual = actualRecipe.components[index];
    return !actual
      || component.dyeId !== actual.dyeId
      || ExactDecimal.parse(component.ratio).compare(actual.ratio) !== 0;
  });
}

export function createId(prefix, timestamp = Date.now()) {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${timestamp}-${random}`;
}
