import { APPLICATION_PRESETS, DYE_BY_ID, MANUFACTURER_GUIDANCE, VYBAR } from "../data/seed.js";
import { ExactDecimal } from "./decimal.js";
import { DomainError, diagnostic } from "./errors.js";
import { calculateFragranceDose } from "./fragrance.js";
import { validateFixedComponents } from "./formula-engine.js";
import { evaluateScale, parseScaleProfile } from "./scale-engine.js";
import { guidanceForWaxType, waxTypeById } from "./wax-guidance.js";

function parseNonNegative(value, fieldPath, { required = true } = {}) {
  if (!required && (value === null || value === undefined || value === "")) return null;
  let parsed;
  try {
    parsed = ExactDecimal.parse(value, { allowNegative: false });
  } catch {
    throw new DomainError("INVALID_DECIMAL", "Enter a valid non-negative decimal.", fieldPath);
  }
  return parsed;
}

function canonical(value) {
  return value?.toSignificant(24) ?? null;
}

function serializeScaleResult(result) {
  return {
    targetG: canonical(result.target),
    displayableTargetG: canonical(result.displayableTarget),
    relativeIncrementPct: canonical(result.relativeIncrementPct),
    plannedDeviationPct: canonical(result.plannedDeviationPct),
    effectiveUncertaintyPct: canonical(result.effectiveUncertaintyPct),
    status: result.status,
  };
}

export function calculateWeighingPlan(input) {
  const diagnostics = [];
  const waxTypeId = input.waxTypeId ?? APPLICATION_PRESETS.defaultWaxTypeId;
  const waxType = waxTypeById(waxTypeId);
  const dyeGuidance = guidanceForWaxType(waxTypeId);
  if (!waxType || !dyeGuidance) {
    throw new DomainError("REFERENCE_NOT_FOUND", "Choose a supported wax type.", "waxTypeId");
  }
  const baseWax = parseNonNegative(input.baseWaxTargetG, "baseWaxTargetG");
  if (baseWax.compare(ExactDecimal.ZERO) <= 0) {
    throw new DomainError("INVALID_DECIMAL", "Base-wax target must be greater than zero.", "baseWaxTargetG");
  }
  const dyeLoadPct = parseNonNegative(input.dyeLoadPct, "dyeLoadPct");
  const components = validateFixedComponents(input.components);
  if (
    input.dosing !== null
    && input.dosing !== undefined
    && (typeof input.dosing !== "object" || Array.isArray(input.dosing) || Object.keys(input.dosing).length > 0)
  ) {
    throw new DomainError(
      "UNSUPPORTED_DOSING_CONFIGURATION",
      "This calculator supports direct dye only; remove dosing-method and concentration settings.",
      "dosing",
    );
  }
  const waxScale = parseScaleProfile(input.scales?.wax, "scales.wax");
  const dyeScale = parseScaleProfile(input.scales?.dye, "scales.dye");

  if (!MANUFACTURER_GUIDANCE.sourceVerified) {
    diagnostics.push(diagnostic(
      "SOURCE_TRANSCRIPTION_UNVERIFIED",
      "warning",
      "Starter color ratios and process guidance still need source verification. The wax-specific dye dosages were checked against your kit photo.",
      "templateId",
    ));
  }

  if (input.visualTarget) {
    diagnostics.push(diagnostic(
      "SCREEN_TARGET_EXPERIMENTAL",
      "warning",
      "The selected screen color uses a constrained experimental ratio adjustment inside the nearest predefined family; it is not a calibrated cured-wax prediction.",
      "visualTarget.hex",
    ));
  }

  const guidanceMinimum = ExactDecimal.parse(dyeGuidance.minimumDyeLoadPct);
  const guidanceMaximum = ExactDecimal.parse(dyeGuidance.maximumDyeLoadPct);
  if (dyeLoadPct.compare(guidanceMinimum) < 0 || dyeLoadPct.compare(guidanceMaximum) > 0) {
    const aboveGuidance = dyeLoadPct.compare(guidanceMaximum) > 0;
    diagnostics.push(diagnostic(
      "DYE_LOAD_OUTSIDE_GUIDANCE",
      "warning",
      aboveGuidance
        ? `This dye load is above your kit’s ${waxType.displayName.toLowerCase()} guidance of ${guidanceMinimum.toFixed(3)}–${guidanceMaximum.toFixed(3)}%. Confirm complete dissolution, cured appearance, surface quality, and color transfer with a physical test.`
        : `This dye load is below your kit’s ${waxType.displayName.toLowerCase()} guidance of ${guidanceMinimum.toFixed(3)}–${guidanceMaximum.toFixed(3)}%. Confirm the cured result with a physical test.`,
      "dyeLoadPct",
    ));
  }

  const pureDyeTotal = baseWax
    .multiply(dyeLoadPct)
    .divide(ExactDecimal.ONE_HUNDRED);

  const dosePlan = components.map((component, index) => {
    const dye = DYE_BY_ID.get(component.dyeId);
    const targetPure = pureDyeTotal.multiply(component.ratio);
    const scaleResult = evaluateScale(targetPure, dyeScale, `components.${component.dyeId}`);
    diagnostics.push(...scaleResult.diagnostics);

    return {
      dyeId: component.dyeId,
      dyeName: dye.displayName,
      ratio: canonical(component.ratio),
      method: "direct",
      targetPureDyeG: canonical(targetPure),
      targetGrossDoseG: canonical(targetPure),
      scale: serializeScaleResult(scaleResult),
      order: index,
    };
  });

  const separateWaxScale = evaluateScale(baseWax, waxScale, "baseWaxTargetG");
  diagnostics.push(...separateWaxScale.diagnostics);

  const additiveLoadPct = input.additive?.enabled
    ? parseNonNegative(input.additive.loadPct, "additive.loadPct")
    : ExactDecimal.ZERO;
  const additiveTarget = baseWax.multiply(additiveLoadPct).divide(ExactDecimal.ONE_HUNDRED);
  const additiveScale = input.additive?.enabled
    ? evaluateScale(additiveTarget, dyeScale, "additive.loadPct")
    : null;
  if (additiveScale) diagnostics.push(...additiveScale.diagnostics);

  const fragranceBasis = baseWax.add(additiveTarget);
  const fragranceDose = input.fragrance?.enabled
    ? calculateFragranceDose({
        basisG: canonical(fragranceBasis),
        ratioFlOzPerLb: input.fragrance.ratioFlOzPerLb,
      })
    : null;

  const knownFormulationMass = baseWax
    .add(pureDyeTotal)
    .add(additiveTarget);

  return Object.freeze({
    baseWax: {
      materialId: waxType.materialId,
      materialName: waxType.displayName,
      waxTypeId: waxType.id,
      guidanceProfileId: dyeGuidance.id,
      targetTotalG: canonical(baseWax),
      targetSeparateG: canonical(baseWax),
      scale: serializeScaleResult(separateWaxScale),
    },
    pureDyeTotalG: canonical(pureDyeTotal),
    dyeLoadPct: canonical(dyeLoadPct),
    dosePlan,
    additive: input.additive?.enabled
      ? {
          materialId: VYBAR.id,
          name: input.additive.name || VYBAR.displayName,
          loadPct: canonical(additiveLoadPct),
          targetG: canonical(additiveTarget),
          scale: serializeScaleResult(additiveScale),
        }
      : null,
    fragrance: input.fragrance?.enabled
      ? {
          name: input.fragrance.name || "Fragrance",
          ...fragranceDose,
        }
      : null,
    visualTarget: input.visualTarget ? Object.freeze({ ...input.visualTarget }) : null,
    knownFormulationMassBeforeFragranceG: canonical(knownFormulationMass),
    finishedFormulationTargetG: fragranceDose ? null : canonical(knownFormulationMass),
    diagnostics,
  });
}

export { DomainError };
