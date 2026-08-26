import { MANUFACTURER_GUIDANCE } from "../data/seed.js";
import { ExactDecimal } from "./decimal.js";

export function fahrenheitToCelsius(value, decimalPlaces = 1) {
  const converted = ExactDecimal.parse(value)
    .subtract("32")
    .multiply("5")
    .divide("9")
    .toFixed(decimalPlaces, "half_even");
  return converted.replace(/\.0+$/, "");
}

export function resolveDyeProcessGuidance(source = MANUFACTURER_GUIDANCE) {
  const minimumF = source.minimumDyeDissolveTemperatureF;
  const maximumF = source.maximumRecommendedDyeTemperatureF;
  const minimumMinutes = ExactDecimal.parse(source.minimumMixSeconds).divide("60").toSignificant();
  const maximumMinutes = ExactDecimal.parse(source.maximumMixSeconds).divide("60").toSignificant();
  return Object.freeze({
    waxFullyMeltedBeforeDye: source.waxFullyMeltedBeforeDye,
    minimumDyeDissolveTemperatureF: minimumF,
    minimumDyeDissolveTemperatureC: fahrenheitToCelsius(minimumF),
    maximumRecommendedDyeTemperatureF: maximumF,
    maximumRecommendedDyeTemperatureC: fahrenheitToCelsius(maximumF),
    minimumMixMinutes: minimumMinutes,
    maximumMixMinutes: maximumMinutes,
    mixUntilCompletelyDissolved: source.mixUntilCompletelyDissolved,
    sourceVerified: source.sourceVerified,
  });
}
