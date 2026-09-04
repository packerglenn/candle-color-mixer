import test from "node:test";
import assert from "node:assert/strict";

import { DYE_GUIDANCE_PROFILES, MANUFACTURER_GUIDANCE } from "../src/data/seed.js";
import { ExactDecimal } from "../src/domain/decimal.js";
import {
  fahrenheitToCelsius,
  resolveDyeProcessGuidance,
} from "../src/domain/process-guidance.js";

test("manufacturer temperature and mixing guidance remains exact seed data", () => {
  assert.equal(MANUFACTURER_GUIDANCE.dosageVerificationStatus, "verified_from_user_photo");
  assert.equal(MANUFACTURER_GUIDANCE.waxFullyMeltedBeforeDye, true);
  assert.equal(MANUFACTURER_GUIDANCE.minimumDyeDissolveTemperatureF, "152");
  assert.equal(MANUFACTURER_GUIDANCE.maximumRecommendedDyeTemperatureF, "194");
  assert.equal(MANUFACTURER_GUIDANCE.minimumMixSeconds, "60");
  assert.equal(MANUFACTURER_GUIDANCE.maximumMixSeconds, "120");
  assert.equal(MANUFACTURER_GUIDANCE.mixUntilCompletelyDissolved, true);
  assert.equal(MANUFACTURER_GUIDANCE.sourceVerified, false);
});

test("every wax profile derives its endpoints and midpoint from ounces by weight", () => {
  for (const guidance of DYE_GUIDANCE_PROFILES) {
    const waxOunces = ExactDecimal.parse(guidance.doseBasisWaxLb).multiply(16);
    const minimum = ExactDecimal.parse(guidance.minimumDoseOz).divide(waxOunces).multiply(100);
    const maximum = ExactDecimal.parse(guidance.maximumDoseOz).divide(waxOunces).multiply(100);
    const midpointDose = ExactDecimal.parse(guidance.minimumDoseOz)
      .add(ExactDecimal.parse(guidance.maximumDoseOz))
      .divide(2);
    const midpoint = guidance.dyeStrengths.find((strength) => strength.id === "midpoint");
    assert.equal(minimum.toSignificant(24), guidance.minimumDyeLoadPct);
    assert.equal(maximum.toSignificant(24), guidance.maximumDyeLoadPct);
    assert.equal(midpointDose.toSignificant(), midpoint.manufacturerDoseOzPer2_2Lb);
    for (const strength of guidance.dyeStrengths) {
      const derivedLoad = ExactDecimal.parse(strength.manufacturerDoseOzPer2_2Lb)
        .divide(waxOunces)
        .multiply(100);
      assert.equal(derivedLoad.toSignificant(24), strength.pureDyeLoadPct);
    }
  }
});

test("manufacturer Fahrenheit values convert deterministically", () => {
  assert.equal(fahrenheitToCelsius("152"), "66.7");
  assert.equal(fahrenheitToCelsius("194"), "90");
});

test("process guidance resolves operator-facing time and temperature values", () => {
  const guidance = resolveDyeProcessGuidance();

  assert.deepEqual(guidance, {
    waxFullyMeltedBeforeDye: true,
    minimumDyeDissolveTemperatureF: "152",
    minimumDyeDissolveTemperatureC: "66.7",
    maximumRecommendedDyeTemperatureF: "194",
    maximumRecommendedDyeTemperatureC: "90",
    minimumMixMinutes: "1",
    maximumMixMinutes: "2",
    mixUntilCompletelyDissolved: true,
    sourceVerified: false,
  });
});
