import test from "node:test";
import assert from "node:assert/strict";
import { ExactDecimal } from "../src/domain/decimal.js";
import { evaluateScale, parseScaleProfile } from "../src/domain/scale-engine.js";

function scale(overrides = {}) {
  return parseScaleProfile({
    id: "test-scale",
    displayName: "Test scale",
    readabilityG: "0.01",
    capacityG: "100",
    minimumLoadG: null,
    verifiedRepeatabilityG: null,
    verifiedAccuracyG: null,
    ...overrides,
  }, "scale");
}

test("0.015 g on a 0.01 g scale is represented honestly", () => {
  const result = evaluateScale(ExactDecimal.parse("0.015"), scale(), "dose");
  assert.equal(result.relativeIncrementPct.toSignificant(24), "66.6666666666666666666667");
  assert.equal(result.displayableTarget.toSignificant(), "0.02");
  assert.equal(result.plannedDeviationPct.toSignificant(24), "33.3333333333333333333333");
  assert.equal(result.status, "poor");
  assert.ok(result.diagnostics.some((item) => item.code === "SCALE_CAPABILITY_UNVERIFIED"));
  assert.ok(result.diagnostics.some((item) => item.code === "MEASUREMENT_FEASIBILITY_POOR"));
});

test("verified uncertainty uses the most conservative bound", () => {
  const result = evaluateScale(ExactDecimal.parse("0.015"), scale({
    readabilityG: "0.001",
    verifiedRepeatabilityG: "0.002",
    verifiedAccuracyG: "0.0015",
  }), "dose");
  assert.equal(result.displayableTarget.toSignificant(), "0.015");
  assert.equal(result.plannedDeviationPct.toSignificant(), "0");
  assert.equal(result.effectiveUncertaintyPct.toSignificant(24), "13.3333333333333333333333");
  assert.equal(result.status, "poor");
});

test("capacity and minimum load are hard errors", () => {
  assert.throws(
    () => evaluateScale(ExactDecimal.parse("101"), scale(), "dose"),
    { code: "SCALE_CAPACITY_EXCEEDED" },
  );
  assert.throws(
    () => evaluateScale(ExactDecimal.parse("0.5"), scale({ minimumLoadG: "1" }), "dose"),
    { code: "SCALE_BELOW_MINIMUM_LOAD" },
  );
});

test("zero targets avoid percentage division", () => {
  const result = evaluateScale(ExactDecimal.ZERO, scale(), "dose");
  assert.equal(result.status, "not_applicable");
  assert.equal(result.relativeIncrementPct, null);
});

test("feasibility boundaries are deterministic", () => {
  const profile = scale({ readabilityG: "1", capacityG: "100" });
  assert.equal(evaluateScale(ExactDecimal.parse("50"), profile, "dose").status, "good");
  assert.equal(evaluateScale(ExactDecimal.parse("20"), profile, "dose").status, "acceptable");
  assert.equal(evaluateScale(ExactDecimal.parse("10"), profile, "dose").status, "caution");
  assert.equal(evaluateScale(ExactDecimal.parse("8"), profile, "dose").status, "poor");
});
