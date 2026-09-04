import seed from "../../data/seed.json" with { type: "json" };

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export const SOURCE_EVIDENCE = deepFreeze({ ...seed.sourceEvidence });
export const VYBAR = deepFreeze({ ...seed.additive });
export const WAX_TYPES = Object.freeze(seed.waxTypes.map((waxType) => deepFreeze(waxType)));
export const WAX_TYPE_BY_ID = new Map(WAX_TYPES.map((waxType) => [waxType.id, waxType]));
export const DYE_GUIDANCE_PROFILES = Object.freeze(
  seed.dyeGuidanceProfiles.map((profile) => deepFreeze(profile)),
);
export const DYE_GUIDANCE_PROFILE_BY_ID = new Map(
  DYE_GUIDANCE_PROFILES.map((profile) => [profile.id, profile]),
);
const defaultWaxType = WAX_TYPE_BY_ID.get(seed.applicationPresets.defaultWaxTypeId);
const defaultGuidanceProfile = DYE_GUIDANCE_PROFILE_BY_ID.get(defaultWaxType.guidanceProfileId);
export const BASE_WAX = deepFreeze({
  id: defaultWaxType.materialId,
  displayName: defaultWaxType.displayName,
  manufacturer: "Brand not recorded",
  waxTypeId: defaultWaxType.id,
});
export const APPLICATION_PRESETS = deepFreeze({
  ...seed.applicationPresets,
  defaultDyeStrengthId: defaultGuidanceProfile.defaultDyeStrengthId,
  dyeStrengths: defaultGuidanceProfile.dyeStrengths,
});

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
