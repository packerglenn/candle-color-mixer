import { CSS_NAMED_COLORS } from "../data/css-named-colors.js";
import { deltaE00, normalizeHex, srgbToLab } from "./color-science.js";

export function findNearestCssNamedColor(hex) {
  const selectedHex = normalizeHex(hex);
  const selectedLab = srgbToLab(selectedHex);
  return CSS_NAMED_COLORS
    .map((color) => ({
      ...color,
      exact: color.hex === selectedHex,
      deltaE00: deltaE00(selectedLab, srgbToLab(color.hex)),
    }))
    .sort((left, right) => left.deltaE00 - right.deltaE00 || left.keyword.localeCompare(right.keyword))[0];
}
