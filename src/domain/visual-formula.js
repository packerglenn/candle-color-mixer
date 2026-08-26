import { hexToRgb, normalizeHex, rgbToHsv } from "./color-science.js";
import { ExactDecimal } from "./decimal.js";
import { validateFixedComponents } from "./formula-engine.js";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function asNumber(value) {
  return ExactDecimal.from(value).toNumber();
}

function roundedDecimal(value) {
  if (!Number.isFinite(value)) throw new TypeError("Visual formula adjustment produced a non-finite ratio.");
  const colorSpaceValue = ExactDecimal.parse(value.toFixed(12), { allowNegative: false });
  return ExactDecimal.parse(colorSpaceValue.toFixed(6, "half_even"), { allowNegative: false });
}

function baselineRatio(components, dyeId) {
  const component = components.find((item) => item.dyeId === dyeId);
  if (!component) throw new TypeError(`Visual adjustment dye ${dyeId} is missing from its seed formula.`);
  return asNumber(component.ratio);
}

function serializeValidated(components) {
  return validateFixedComponents(components).map((component) => ({
    dyeId: component.dyeId,
    ratio: component.ratio.toSignificant(),
  }));
}

function unchanged(components) {
  return serializeValidated(components.map((component) => ({
    dyeId: component.dyeId,
    ratio: ExactDecimal.from(component.ratio).toSignificant(),
  })));
}

function shortestHueDelta(selectedHue, anchorHue) {
  return ((selectedHue - anchorHue + 540) % 360) - 180;
}

function deriveTintedPair(model, anchorHsv, selectedHsv, hueDelta, baseline) {
  const baselineTint = baselineRatio(baseline, model.tintDyeId);
  const baselinePrimary = baselineRatio(baseline, model.primaryDyeId);
  const baselineSecondary = baselineRatio(baseline, model.secondaryDyeId);
  const baselinePrimaryShare = baselinePrimary / (baselinePrimary + baselineSecondary);

  const tint = clamp(
    baselineTint
      + (anchorHsv.s - selectedHsv.s) * asNumber(model.desaturationToTint)
      + (selectedHsv.v - anchorHsv.v) * asNumber(model.brightnessToTint),
    asNumber(model.minimumTintRatio),
    asNumber(model.maximumTintRatio),
  );
  const primaryShare = clamp(
    baselinePrimaryShare
      + model.hueDirection * hueDelta * asNumber(model.hueShiftPerDegree),
    asNumber(model.minimumPrimaryShare),
    asNumber(model.maximumPrimaryShare),
  );

  const tintRatio = roundedDecimal(tint);
  const chromaticRemainder = ExactDecimal.ONE.subtract(tintRatio);
  const primaryRatio = roundedDecimal(chromaticRemainder.toNumber() * primaryShare);
  const secondaryRatio = ExactDecimal.ONE.subtract(tintRatio).subtract(primaryRatio);

  return serializeValidated([
    { dyeId: model.primaryDyeId, ratio: primaryRatio.toSignificant() },
    { dyeId: model.secondaryDyeId, ratio: secondaryRatio.toSignificant() },
    { dyeId: model.tintDyeId, ratio: tintRatio.toSignificant() },
  ]);
}

function derivePair(model, hueDelta, baseline) {
  const baselinePrimary = baselineRatio(baseline, model.primaryDyeId);
  const primary = clamp(
    baselinePrimary + model.hueDirection * hueDelta * asNumber(model.hueShiftPerDegree),
    asNumber(model.minimumPrimaryRatio),
    asNumber(model.maximumPrimaryRatio),
  );
  const primaryRatio = roundedDecimal(primary);
  return serializeValidated([
    { dyeId: model.primaryDyeId, ratio: primaryRatio.toSignificant() },
    { dyeId: model.secondaryDyeId, ratio: ExactDecimal.ONE.subtract(primaryRatio).toSignificant() },
  ]);
}

function deriveNeutral(model, anchorHsv, selectedHsv, baseline) {
  const baselineDark = baselineRatio(baseline, model.darkDyeId);
  const dark = clamp(
    baselineDark + (anchorHsv.v - selectedHsv.v) * asNumber(model.darkeningPerValue),
    asNumber(model.minimumDarkRatio),
    asNumber(model.maximumDarkRatio),
  );
  const darkRatio = roundedDecimal(dark);
  return serializeValidated([
    { dyeId: model.lightDyeId, ratio: ExactDecimal.ONE.subtract(darkRatio).toSignificant() },
    { dyeId: model.darkDyeId, ratio: darkRatio.toSignificant() },
  ]);
}

/**
 * Derive a bounded experimental ratio set inside a predefined color family.
 * Screen-space HSV movement controls the adjustment; this is not a cured-wax
 * color prediction and it never changes the operator-selected total dye load.
 */
export function deriveVisualFormula(template, selectedHex, baselineComponents) {
  if (!template?.screenAnchorHex || !template.visualAdjustmentModel) {
    return unchanged(baselineComponents);
  }
  if (normalizeHex(selectedHex) === normalizeHex(template.screenAnchorHex)) {
    return unchanged(baselineComponents);
  }

  const anchorHsv = rgbToHsv(hexToRgb(template.screenAnchorHex));
  const selectedHsv = rgbToHsv(hexToRgb(selectedHex));
  const hueDelta = shortestHueDelta(selectedHsv.h, anchorHsv.h);
  const model = template.visualAdjustmentModel;

  if (model.kind === "two_color_plus_tint") {
    return deriveTintedPair(model, anchorHsv, selectedHsv, hueDelta, baselineComponents);
  }
  if (model.kind === "two_color") {
    return derivePair(model, hueDelta, baselineComponents);
  }
  if (model.kind === "neutral_value") {
    return deriveNeutral(model, anchorHsv, selectedHsv, baselineComponents);
  }
  throw new TypeError(`Unsupported visual adjustment model: ${model.kind}`);
}
