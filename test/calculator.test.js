import test from "node:test";
import assert from "node:assert/strict";
import { TEMPLATE_BY_ID } from "../src/data/seed.js";
import { calculateWeighingPlan } from "../src/domain/calculator.js";
import { resolveTemplate } from "../src/domain/formula-engine.js";

const scales = {
  wax: {
    id: "wax-scale",
    displayName: "Wax scale",
    readabilityG: "0.1",
    capacityG: "5000",
    minimumLoadG: null,
    verifiedRepeatabilityG: "0.1",
    verifiedAccuracyG: "0.1",
  },
  dye: {
    id: "dye-scale",
    displayName: "Dye scale",
    readabilityG: "0.001",
    capacityG: "50",
    minimumLoadG: null,
    verifiedRepeatabilityG: "0.001",
    verifiedAccuracyG: "0.001",
  },
};

function raspberryComponents() {
  return resolveTemplate(TEMPLATE_BY_ID.get("manufacturer-raspberry"))
    .map((component) => ({
      dyeId: component.dyeId,
      ratio: component.ratio.toSignificant(),
    }));
}

function baseInput(overrides = {}) {
  return {
    baseWaxTargetG: "100.000",
    dyeLoadPct: "0.30",
    components: raspberryComponents(),
    scales,
    additive: { enabled: false },
    fragrance: { enabled: false },
    ...overrides,
  };
}

test("direct Raspberry calculation matches the specification", () => {
  const result = calculateWeighingPlan(baseInput());
  assert.equal(result.pureDyeTotalG, "0.3");
  assert.deepEqual(result.dosePlan.map((dose) => dose.targetPureDyeG), ["0.21", "0.075", "0.015"]);
  assert.ok(result.dosePlan.every((dose) => dose.method === "direct"));
  assert.ok(result.dosePlan.every((dose) => dose.targetGrossDoseG === dose.targetPureDyeG));
  assert.equal(result.baseWax.targetSeparateG, "100");
  assert.equal(result.finishedFormulationTargetG, "100.3");
});

test("optional additive and fragrance contribute to finished mass", () => {
  const result = calculateWeighingPlan(baseInput({
    additive: { enabled: true, name: "Vybar", loadPct: "0.5" },
    fragrance: { enabled: true, name: "Rose", loadPct: "6" },
  }));
  assert.equal(result.additive.targetG, "0.5");
  assert.equal(result.fragrance.targetG, "6");
  assert.equal(result.finishedFormulationTargetG, "106.8");
});

test("visual target selection is carried as an experimental diagnostic", () => {
  const result = calculateWeighingPlan(baseInput({
    visualTarget: {
      hex: "#47a9a0",
      mapping: "constrained_family_adjustment",
      standardNameSystem: "css-color-4",
      standardName: "Light Sea Green",
      standardKeyword: "lightseagreen",
      standardReferenceHex: "#20b2aa",
      standardNameDeltaE00: "3.458227",
    },
  }));
  assert.ok(result.diagnostics.some((item) => item.code === "SCREEN_TARGET_EXPERIMENTAL"));
  assert.equal(result.visualTarget.standardName, "Light Sea Green");
  assert.equal(result.pureDyeTotalG, "0.3");
});

test("zero dye load is valid and does not divide by zero", () => {
  const result = calculateWeighingPlan(baseInput({ dyeLoadPct: "0" }));
  assert.equal(result.pureDyeTotalG, "0");
  assert.ok(result.dosePlan.every((dose) => dose.scale.status === "not_applicable"));
});

test("legacy concentrate configuration is rejected because the product is direct-dye only", () => {
  assert.throws(() => calculateWeighingPlan(baseInput({
    dosing: {
      "candle-shop-white": { method: "concentrate", concentratePct: "5" },
    },
  })), { code: "UNSUPPORTED_DOSING_CONFIGURATION" });
});

test("same input produces stable canonical output", () => {
  const input = baseInput();
  const expected = JSON.stringify(calculateWeighingPlan(input));
  for (let index = 0; index < 1000; index += 1) {
    assert.equal(JSON.stringify(calculateWeighingPlan(input)), expected);
  }
});
