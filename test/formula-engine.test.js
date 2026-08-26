import test from "node:test";
import assert from "node:assert/strict";
import { TEMPLATE_BY_ID } from "../src/data/seed.js";
import { resolveTemplate, validateFixedComponents } from "../src/domain/formula-engine.js";

function serialized(components) {
  return components.map((component) => [component.dyeId, component.ratio.toSignificant()]);
}

test("fixed Raspberry ratios resolve without normalization", () => {
  assert.deepEqual(
    serialized(resolveTemplate(TEMPLATE_BY_ID.get("manufacturer-raspberry"))),
    [
      ["candle-shop-red", "0.7"],
      ["candle-shop-blue", "0.25"],
      ["candle-shop-white", "0.05"],
    ],
  );
});

test("Turquoise endpoints and midpoint remain constrained", () => {
  const template = TEMPLATE_BY_ID.get("manufacturer-turquoise");
  assert.deepEqual(serialized(resolveTemplate(template, "0.80")), [
    ["candle-shop-green", "0.8"],
    ["candle-shop-blue", "0.15"],
    ["candle-shop-white", "0.05"],
  ]);
  assert.deepEqual(serialized(resolveTemplate(template, "0.85")), [
    ["candle-shop-green", "0.85"],
    ["candle-shop-blue", "0.1"],
    ["candle-shop-white", "0.05"],
  ]);
  assert.deepEqual(serialized(resolveTemplate(template)), [
    ["candle-shop-green", "0.825"],
    ["candle-shop-blue", "0.125"],
    ["candle-shop-white", "0.05"],
  ]);
});

test("invalid ranges, totals, and duplicate dyes fail explicitly", () => {
  const turquoise = TEMPLATE_BY_ID.get("manufacturer-turquoise");
  assert.throws(() => resolveTemplate(turquoise, "0.79"), { code: "INVALID_RANGE_SELECTION" });
  assert.throws(() => validateFixedComponents([
    { dyeId: "candle-shop-red", ratio: "0.70" },
    { dyeId: "candle-shop-blue", ratio: "0.25" },
  ]), { code: "INVALID_RATIO_SUM" });
  assert.throws(() => validateFixedComponents([
    { dyeId: "candle-shop-red", ratio: "0.50" },
    { dyeId: "candle-shop-red", ratio: "0.50" },
  ]), { code: "DUPLICATE_DYE_COMPONENT" });
});

test("all six seed templates resolve to exact 100% formulas", () => {
  const expected = {
    "manufacturer-raspberry": ["0.7", "0.25", "0.05"],
    "manufacturer-coral": ["0.5", "0.35", "0.15"],
    "manufacturer-turquoise": ["0.825", "0.125", "0.05"],
    "manufacturer-lime": ["0.25", "0.7", "0.05"],
    "manufacturer-olive": ["0.85", "0.15"],
    "manufacturer-gray-coal": ["0.94", "0.06"],
  };
  for (const [id, ratios] of Object.entries(expected)) {
    assert.deepEqual(resolveTemplate(TEMPLATE_BY_ID.get(id)).map((item) => item.ratio.toSignificant()), ratios);
  }
});

test("formula seed records are deeply immutable", () => {
  const template = TEMPLATE_BY_ID.get("manufacturer-raspberry");
  assert.ok(Object.isFrozen(template));
  assert.ok(Object.isFrozen(template.components));
  assert.throws(() => template.components.push({ dyeId: "candle-shop-black", ratio: "0" }));
});
