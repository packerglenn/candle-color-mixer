import test from "node:test";
import assert from "node:assert/strict";
import { APPLICATION_PRESETS, TEMPLATE_BY_ID } from "../src/data/seed.js";
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
  assert.equal(result.knownFormulationMassBeforeFragranceG, "100.3");
  assert.equal(result.finishedFormulationTargetG, "100.3");
});

test("pillar application defaults to the regular color-strength preset", () => {
  const regular = APPLICATION_PRESETS.dyeStrengths.find((strength) => (
    strength.id === APPLICATION_PRESETS.defaultDyeStrengthId
  ));
  const result = calculateWeighingPlan(baseInput({
    dyeLoadPct: regular.pureDyeLoadPct,
  }));

  assert.equal(APPLICATION_PRESETS.waxApplication, "pillar");
  assert.equal(APPLICATION_PRESETS.status, "engineering_starting_point");
  assert.equal(result.dyeLoadPct, "0.5");
  assert.equal(result.pureDyeTotalG, "0.5");
  assert.deepEqual(result.dosePlan.map((dose) => dose.targetPureDyeG), ["0.35", "0.125", "0.025"]);
});

test("pillar color-strength presets scale dye amount without changing ratios", () => {
  const expected = {
    regular: { load: "0.5", total: "0.5" },
    medium: { load: "0.45", total: "0.45" },
    light: { load: "0.4", total: "0.4" },
  };

  for (const strength of APPLICATION_PRESETS.dyeStrengths) {
    const result = calculateWeighingPlan(baseInput({ dyeLoadPct: strength.pureDyeLoadPct }));
    assert.equal(result.dyeLoadPct, expected[strength.id].load);
    assert.equal(result.pureDyeTotalG, expected[strength.id].total);
    assert.deepEqual(result.dosePlan.map((dose) => dose.ratio), ["0.7", "0.25", "0.05"]);
  }
});

test("optional additive sets the fragrance basis and known pre-fragrance mass", () => {
  const result = calculateWeighingPlan(baseInput({
    additive: { enabled: true, name: "Vybar", loadPct: "0.5" },
    fragrance: { enabled: true, name: "Rose", ratioFlOzPerLb: "1" },
  }));
  assert.equal(result.additive.targetG, "0.5");
  assert.equal(result.fragrance.basisG, "100.5");
  assert.equal(result.fragrance.targetFlOz, "0.221564573495801968626589");
  assert.equal(result.fragrance.targetMl, "6.55244646428080348882412");
  assert.equal(result.knownFormulationMassBeforeFragranceG, "100.8");
  assert.equal(result.finishedFormulationTargetG, null);
});

test("fragrance volume requires a valid fluid-ounce ratio", () => {
  assert.throws(() => calculateWeighingPlan(baseInput({
    fragrance: { enabled: true, name: "Rose", ratioFlOzPerLb: "" },
  })), {
    code: "INVALID_DECIMAL",
    fieldPath: "fragrance.ratioFlOzPerLb",
  });
});

test("dye load does not change the wax-plus-Vybar fragrance basis", () => {
  const fragrance = { enabled: true, name: "Rose", ratioFlOzPerLb: "1" };
  const withoutDye = calculateWeighingPlan(baseInput({ dyeLoadPct: "0", fragrance }));
  const withDye = calculateWeighingPlan(baseInput({ dyeLoadPct: "0.5", fragrance }));

  assert.equal(withoutDye.fragrance.basisG, "100");
  assert.equal(withDye.fragrance.basisG, "100");
  assert.equal(withoutDye.fragrance.targetMl, withDye.fragrance.targetMl);
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
