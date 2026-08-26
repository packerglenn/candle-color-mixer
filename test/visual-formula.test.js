import test from "node:test";
import assert from "node:assert/strict";
import { FORMULA_TEMPLATES, TEMPLATE_BY_ID } from "../src/data/seed.js";
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from "../src/domain/color-science.js";
import { ExactDecimal, sumDecimals } from "../src/domain/decimal.js";
import { resolveTemplate, validateFixedComponents } from "../src/domain/formula-engine.js";
import { deriveVisualFormula } from "../src/domain/visual-formula.js";

function baseline(template) {
  return resolveTemplate(template).map((component) => ({
    dyeId: component.dyeId,
    ratio: component.ratio.toSignificant(),
  }));
}

function ratioOf(components, dyeId) {
  return ExactDecimal.parse(components.find((item) => item.dyeId === dyeId).ratio);
}

function movedHex(anchorHex, { hue = 0, saturation = 0, value = 0 }) {
  const anchor = rgbToHsv(hexToRgb(anchorHex));
  return rgbToHex(hsvToRgb(anchor.h + hue, anchor.s + saturation, anchor.v + value));
}

test("every visual anchor preserves its exact seed midpoint formula", () => {
  for (const template of FORMULA_TEMPLATES) {
    assert.deepEqual(
      deriveVisualFormula(template, template.screenAnchorHex, baseline(template)),
      baseline(template),
    );
  }
});

test("Raspberry hue movement continuously rebalances Red and Blue", () => {
  const template = TEMPLATE_BY_ID.get("manufacturer-raspberry");
  const seed = baseline(template);
  const towardRed = deriveVisualFormula(template, movedHex(template.screenAnchorHex, { hue: 12 }), seed);
  const towardBlue = deriveVisualFormula(template, movedHex(template.screenAnchorHex, { hue: -12 }), seed);

  assert.ok(ratioOf(towardRed, "candle-shop-red").compare("0.7") > 0);
  assert.ok(ratioOf(towardRed, "candle-shop-blue").compare("0.25") < 0);
  assert.ok(ratioOf(towardBlue, "candle-shop-red").compare("0.7") < 0);
  assert.ok(ratioOf(towardBlue, "candle-shop-blue").compare("0.25") > 0);
  assert.notDeepEqual(towardRed, towardBlue);
});

test("lower Raspberry saturation increases White without changing total dye load", () => {
  const template = TEMPLATE_BY_ID.get("manufacturer-raspberry");
  const adjusted = deriveVisualFormula(
    template,
    movedHex(template.screenAnchorHex, { saturation: -0.2 }),
    baseline(template),
  );
  assert.ok(ratioOf(adjusted, "candle-shop-white").compare("0.05") > 0);
  assert.ok(sumDecimals(adjusted.map((item) => ExactDecimal.parse(item.ratio))).equals(ExactDecimal.ONE));
});

test("Gray coal value movement rebalances White and Black", () => {
  const template = TEMPLATE_BY_ID.get("manufacturer-gray-coal");
  const seed = baseline(template);
  const lighter = deriveVisualFormula(template, "#777777", seed);
  const darker = deriveVisualFormula(template, "#333333", seed);

  assert.ok(ratioOf(lighter, "candle-shop-white").compare(ratioOf(darker, "candle-shop-white")) > 0);
  assert.ok(ratioOf(lighter, "candle-shop-black").compare(ratioOf(darker, "candle-shop-black")) < 0);
});

test("visual adjustment models remain bounded and total exactly 100%", () => {
  for (const template of FORMULA_TEMPLATES) {
    const anchor = rgbToHsv(hexToRgb(template.screenAnchorHex));
    for (const hueDelta of [-60, -20, 0, 20, 60]) {
      for (const saturationDelta of [-0.35, 0, 0.25]) {
        for (const valueDelta of [-0.35, 0, 0.25]) {
          const selected = rgbToHex(hsvToRgb(
            anchor.h + hueDelta,
            anchor.s + saturationDelta,
            anchor.v + valueDelta,
          ));
          const adjusted = deriveVisualFormula(template, selected, baseline(template));
          assert.doesNotThrow(() => validateFixedComponents(adjusted));
          for (const component of adjusted) {
            const ratio = ExactDecimal.parse(component.ratio);
            assert.ok(ratio.compare(ExactDecimal.ZERO) >= 0);
            assert.ok(ratio.compare(ExactDecimal.ONE) <= 0);
          }
        }
      }
    }
  }
});
