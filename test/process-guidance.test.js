import test from "node:test";
import assert from "node:assert/strict";

import { MANUFACTURER_GUIDANCE } from "../src/data/seed.js";
import {
  fahrenheitToCelsius,
  resolveDyeProcessGuidance,
} from "../src/domain/process-guidance.js";

test("manufacturer temperature and mixing guidance remains exact seed data", () => {
  assert.equal(MANUFACTURER_GUIDANCE.waxFullyMeltedBeforeDye, true);
  assert.equal(MANUFACTURER_GUIDANCE.minimumDyeDissolveTemperatureF, "152");
  assert.equal(MANUFACTURER_GUIDANCE.maximumRecommendedDyeTemperatureF, "194");
  assert.equal(MANUFACTURER_GUIDANCE.minimumMixSeconds, "60");
  assert.equal(MANUFACTURER_GUIDANCE.maximumMixSeconds, "120");
  assert.equal(MANUFACTURER_GUIDANCE.mixUntilCompletelyDissolved, true);
  assert.equal(MANUFACTURER_GUIDANCE.sourceVerified, false);
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
