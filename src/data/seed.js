import seed from "../../data/seed.json" with { type: "json" };

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export const SOURCE_EVIDENCE = deepFreeze({ ...seed.sourceEvidence });
export const BASE_WAX = deepFreeze({ ...seed.baseWax });
export const VYBAR = deepFreeze({ ...seed.additive });
export const APPLICATION_PRESETS = deepFreeze({ ...seed.applicationPresets });

export const DYES = Object.freeze(seed.dyes.map((dye) => Object.freeze({
  id: `candle-shop-${dye.slug}`,
  displayName: dye.displayName,
  manufacturer: "Candle Shop",
  dyeSystemId: seed.dyeSystem.id,
})));

export const DYE_BY_ID = new Map(DYES.map((dye) => [dye.id, dye]));
export const FORMULA_TEMPLATES = Object.freeze(
  seed.formulaTemplates.map((template) => deepFreeze(template)),
);
export const TEMPLATE_BY_ID = new Map(
  FORMULA_TEMPLATES.map((template) => [template.id, template]),
);
export const MANUFACTURER_GUIDANCE = Object.freeze({
  ...seed.manufacturerGuidance,
  sourceVerified: SOURCE_EVIDENCE.verificationStatus === "verified",
});
