import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveActualRecipe,
  recipeChanged,
  resolvedTemplateComponents,
  starterColors,
} from "../src/domain/library.js";
import { ExactDecimal } from "../src/domain/decimal.js";

test("starter colors expose every bundled manufacturer formula", () => {
  const colors = starterColors();
  assert.equal(colors.length, 6);
  assert.ok(colors.every((color) => color.kind === "starter"));
  assert.ok(colors.every((color) => color.recipe.components.length >= 2));
  assert.ok(colors.every((color) => color.recipe.waxTypeId === "paraffin"));
  assert.ok(colors.every((color) => color.recipe.dyeLoadPct === "0.284090909090909090909091"));
});

test("Coral preserves last night's shop-trial provenance and editable 50/41/9 ratio", () => {
  const coral = starterColors().find((color) => color.name === "Coral");
  assert.equal(coral.recipe.sourceType, "shop_trial");
  assert.equal(coral.recipe.verificationStatus, "testing");
  assert.deepEqual(coral.recipe.components, [
    { dyeId: "candle-shop-red", ratio: "0.5" },
    { dyeId: "candle-shop-yellow", ratio: "0.41" },
    { dyeId: "candle-shop-white", ratio: "0.09" },
  ]);
});

test("bounded starter formulas resolve to fixed reproducible ratios", () => {
  assert.deepEqual(resolvedTemplateComponents("manufacturer-turquoise"), [
    { dyeId: "candle-shop-green", ratio: "0.825" },
    { dyeId: "candle-shop-blue", ratio: "0.125" },
    { dyeId: "candle-shop-white", ratio: "0.05" },
  ]);
});

test("actual measurements derive a normalized reusable recipe", () => {
  const actual = deriveActualRecipe({
    baseWaxActualG: "100",
    dyeActuals: [
      { dyeId: "candle-shop-red", actualG: "0.225" },
      { dyeId: "candle-shop-blue", actualG: "0.075" },
    ],
  });
  assert.equal(actual.pureDyeTotalG, "0.3");
  assert.equal(actual.dyeLoadPct, "0.3");
  assert.deepEqual(actual.components, [
    { dyeId: "candle-shop-red", ratio: "0.75" },
    { dyeId: "candle-shop-blue", ratio: "0.25" },
  ]);
});

test("rounded actual ratios retain an exact reusable total", () => {
  const actual = deriveActualRecipe({
    baseWaxActualG: "100",
    dyeActuals: [
      { dyeId: "candle-shop-red", actualG: "0.72" },
      { dyeId: "candle-shop-blue", actualG: "0.25" },
      { dyeId: "candle-shop-white", actualG: "0.05" },
    ],
  });
  const total = actual.components.reduce(
    (sum, component) => sum.add(ExactDecimal.parse(component.ratio)),
    ExactDecimal.ZERO,
  );
  assert.equal(total.toSignificant(), "1");
});

test("formula comparison detects an adjustment", () => {
  const planned = {
    dyeLoadPct: "0.3",
    components: [
      { dyeId: "candle-shop-red", ratio: "0.7" },
      { dyeId: "candle-shop-blue", ratio: "0.3" },
    ],
  };
  assert.equal(recipeChanged(planned, {
    dyeLoadPct: "0.3",
    components: [
      { dyeId: "candle-shop-red", ratio: "0.75" },
      { dyeId: "candle-shop-blue", ratio: "0.25" },
    ],
  }), true);
});
