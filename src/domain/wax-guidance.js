import {
  APPLICATION_PRESETS,
  DYE_GUIDANCE_PROFILE_BY_ID,
  WAX_TYPE_BY_ID,
} from "../data/seed.js";
import { ExactDecimal } from "./decimal.js";

export function waxTypeById(waxTypeId = APPLICATION_PRESETS.defaultWaxTypeId) {
  return WAX_TYPE_BY_ID.get(waxTypeId) ?? null;
}

export function guidanceForWaxType(waxTypeId = APPLICATION_PRESETS.defaultWaxTypeId) {
  const waxType = waxTypeById(waxTypeId);
  if (!waxType) return null;
  return DYE_GUIDANCE_PROFILE_BY_ID.get(waxType.guidanceProfileId) ?? null;
}

export function defaultStrengthForWaxType(waxTypeId = APPLICATION_PRESETS.defaultWaxTypeId) {
  const guidance = guidanceForWaxType(waxTypeId);
  return guidance?.dyeStrengths.find((strength) => strength.id === guidance.defaultDyeStrengthId) ?? null;
}

export function strengthForDyeLoad(waxTypeId, dyeLoadPct) {
  const guidance = guidanceForWaxType(waxTypeId);
  if (!guidance) return null;
  const selected = ExactDecimal.parse(String(dyeLoadPct));
  return guidance.dyeStrengths.find((strength) => (
    ExactDecimal.parse(strength.pureDyeLoadPct).equals(selected)
  )) ?? null;
}
