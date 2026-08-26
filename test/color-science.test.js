import test from "node:test";
import assert from "node:assert/strict";
import { FORMULA_TEMPLATES } from "../src/data/seed.js";
import {
  deltaE00,
  findNearestScreenTemplate,
  hexToRgb,
  hsvToRgb,
  normalizeHex,
  rgbToHex,
  rgbToHsv,
  srgbToLab,
} from "../src/domain/color-science.js";

test("HEX, RGB, and HSV conversions round trip", () => {
  const source = "#47a9a0";
  assert.equal(normalizeHex("47A9A0"), source);
  assert.equal(rgbToHex(hexToRgb(source)), source);
  const hsv = rgbToHsv(hexToRgb(source));
  assert.equal(rgbToHex(hsvToRgb(hsv.h, hsv.s, hsv.v)), source);
  assert.throws(() => normalizeHex("#abc"));
});

test("sRGB D65 reference colors convert to expected Lab", () => {
  const white = srgbToLab("#ffffff");
  assert.ok(Math.abs(white.l - 100) < 1e-5);
  assert.ok(Math.abs(white.a) < 1e-4);
  assert.ok(Math.abs(white.b) < 1e-4);
  const black = srgbToLab("#000000");
  assert.ok(Math.abs(black.l) < 1e-12);
});

test("CIEDE2000 passes Sharma reference pairs", () => {
  const pairs = [
    [{ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ l: 50, a: 3.1571, b: -77.2803 }, { l: 50, a: 0, b: -82.7485 }, 2.8615],
    [{ l: 50, a: 2.8361, b: -74.0200 }, { l: 50, a: 0, b: -82.7485 }, 3.4412],
    [{ l: 50, a: -1.3802, b: -84.2814 }, { l: 50, a: 0, b: -82.7485 }, 1.0000],
  ];
  for (const [left, right, expected] of pairs) {
    assert.ok(Math.abs(deltaE00(left, right) - expected) <= 1e-4);
    assert.ok(Math.abs(deltaE00(left, right) - deltaE00(right, left)) <= 1e-12);
  }
  assert.equal(deltaE00(pairs[0][0], pairs[0][0]), 0);
});

test("screen anchors map back to their own predefined formula", () => {
  for (const template of FORMULA_TEMPLATES) {
    assert.equal(findNearestScreenTemplate(template.screenAnchorHex, FORMULA_TEMPLATES).template.id, template.id);
  }
});

test("achromatic wheel selections stay in the neutral template family", () => {
  for (const hex of ["#ffffff", "#b6b6b6", "#555555", "#000000"]) {
    assert.equal(
      findNearestScreenTemplate(hex, FORMULA_TEMPLATES).template.id,
      "manufacturer-gray-coal",
    );
  }
});

test("vivid blue cannot be classified as the neutral Gray coal family", () => {
  const match = findNearestScreenTemplate("#547aff", FORMULA_TEMPLATES);
  assert.equal(match.template.id, "manufacturer-raspberry");
  assert.notEqual(match.template.id, "manufacturer-gray-coal");
});

test("vivid colors around the wheel never fall into the neutral family", () => {
  for (const value of [0.5, 1]) {
    for (let hue = 0; hue < 360; hue += 15) {
      const hex = rgbToHex(hsvToRgb(hue, 0.7, value));
      assert.notEqual(
        findNearestScreenTemplate(hex, FORMULA_TEMPLATES).template.id,
        "manufacturer-gray-coal",
        `${hex} at hue ${hue}° was incorrectly classified as neutral`,
      );
    }
  }
});

test("pale mint remains chromatic instead of collapsing to Gray coal", () => {
  const match = findNearestScreenTemplate("#e7fffa", FORMULA_TEMPLATES);
  assert.equal(match.template.id, "manufacturer-turquoise");
});

test("visible pale tints around the wheel retain a chromatic family", () => {
  for (let hue = 0; hue < 360; hue += 15) {
    const hex = rgbToHex(hsvToRgb(hue, 0.08, 1));
    assert.notEqual(
      findNearestScreenTemplate(hex, FORMULA_TEMPLATES).template.id,
      "manufacturer-gray-coal",
      `${hex} at hue ${hue}° was incorrectly classified as neutral`,
    );
  }
});
