import test from "node:test";
import assert from "node:assert/strict";

import { calculateFragranceDose } from "../src/domain/fragrance.js";

test("one US fluid ounce per pound scales exactly to a 100 g batch", () => {
  const result = calculateFragranceDose({
    basisG: "100",
    ratioFlOzPerLb: "1",
  });

  assert.equal(result.basisKind, "wax_plus_additive_mass");
  assert.equal(result.targetFlOz, "0.220462262184877580722974");
  assert.equal(result.targetMl, "6.51984722814010297395435");
});

test("fragrance volume uses the wax-plus-additive basis", () => {
  const result = calculateFragranceDose({
    basisG: "100.5",
    ratioFlOzPerLb: "1",
  });

  assert.equal(result.basisG, "100.5");
  assert.equal(result.targetFlOz, "0.221564573495801968626589");
  assert.equal(result.targetMl, "6.55244646428080348882412");
});

test("fragrance ratios scale proportionally", () => {
  const result = calculateFragranceDose({
    basisG: "100",
    ratioFlOzPerLb: "0.5",
  });

  assert.equal(result.targetFlOz, "0.110231131092438790361487");
  assert.equal(result.targetMl, "3.25992361407005148697717");
});

test("fragrance ratios reject non-positive and unsafe decimal formats", () => {
  for (const ratioFlOzPerLb of ["", "0", "-1", "1e0", "1 fl oz/lb"]) {
    assert.throws(() => calculateFragranceDose({
      basisG: "100",
      ratioFlOzPerLb,
    }), { code: "INVALID_DECIMAL", fieldPath: "fragrance.ratioFlOzPerLb" });
  }
});
