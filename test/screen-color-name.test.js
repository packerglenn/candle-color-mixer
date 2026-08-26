import test from "node:test";
import assert from "node:assert/strict";
import { CSS_NAMED_COLORS } from "../src/data/css-named-colors.js";
import { findNearestCssNamedColor } from "../src/domain/screen-color-name.js";

test("the bundled CSS Color 4 table contains 139 unique opaque sRGB values", () => {
  assert.equal(CSS_NAMED_COLORS.length, 139);
  assert.equal(new Set(CSS_NAMED_COLORS.map((color) => color.hex)).size, 139);
});

test("every exact CSS named color resolves to itself at zero distance", () => {
  for (const color of CSS_NAMED_COLORS) {
    const match = findNearestCssNamedColor(color.hex);
    assert.equal(match.hex, color.hex);
    assert.equal(match.deltaE00, 0);
    assert.equal(match.exact, true);
  }
});

test("reported screen colors receive deterministic nearest CSS names", () => {
  assert.deepEqual(
    findNearestCssNamedColor("#e7fffa"),
    {
      name: "Light Cyan",
      keyword: "lightcyan",
      hex: "#e0ffff",
      exact: false,
      deltaE00: findNearestCssNamedColor("#e7fffa").deltaE00,
    },
  );
  assert.equal(findNearestCssNamedColor("#547aff").name, "Royal Blue");
  assert.equal(findNearestCssNamedColor("#ff0000").name, "Red");
});

test("invalid screen colors fail before naming", () => {
  assert.throws(() => findNearestCssNamedColor("not-a-color"), TypeError);
});
