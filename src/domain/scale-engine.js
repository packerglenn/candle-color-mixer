import { ExactDecimal, percent } from "./decimal.js";
import { DomainError, diagnostic } from "./errors.js";

function parsePositive(value, fieldPath, { allowZero = false, optional = false } = {}) {
  if (optional && (value === null || value === undefined || value === "")) return null;
  let parsed;
  try {
    parsed = ExactDecimal.parse(value, { allowNegative: false });
  } catch {
    throw new DomainError("INVALID_DECIMAL", "Enter a valid decimal mass.", fieldPath);
  }
  const minimumComparison = parsed.compare(ExactDecimal.ZERO);
  if (minimumComparison < 0 || (!allowZero && minimumComparison === 0)) {
    throw new DomainError("INVALID_SCALE", "Scale values must be greater than zero.", fieldPath);
  }
  return parsed;
}

function classify(metric) {
  if (metric.compare(ExactDecimal.fromInteger(2)) <= 0) return "good";
  if (metric.compare(ExactDecimal.fromInteger(5)) <= 0) return "acceptable";
  if (metric.compare(ExactDecimal.fromInteger(10)) <= 0) return "caution";
  return "poor";
}

const RANK = Object.freeze({ not_applicable: -1, good: 0, acceptable: 1, caution: 2, poor: 3 });

function worstStatus(statuses) {
  return statuses.reduce(
    (worst, status) => (RANK[status] > RANK[worst] ? status : worst),
    "good",
  );
}

export function parseScaleProfile(profile, fieldPath) {
  if (!profile) {
    throw new DomainError("REFERENCE_NOT_FOUND", "Select a scale profile.", fieldPath);
  }
  return {
    id: profile.id,
    displayName: profile.displayName,
    readability: parsePositive(profile.readabilityG, `${fieldPath}.readabilityG`),
    capacity: parsePositive(profile.capacityG, `${fieldPath}.capacityG`),
    minimumLoad: parsePositive(profile.minimumLoadG, `${fieldPath}.minimumLoadG`, {
      allowZero: true,
      optional: true,
    }),
    repeatability: parsePositive(profile.verifiedRepeatabilityG, `${fieldPath}.verifiedRepeatabilityG`, {
      optional: true,
    }),
    accuracy: parsePositive(profile.verifiedAccuracyG, `${fieldPath}.verifiedAccuracyG`, {
      optional: true,
    }),
  };
}

export function evaluateScale(target, parsedScale, fieldPath) {
  const targetMass = ExactDecimal.from(target);
  if (targetMass.compare(ExactDecimal.ZERO) < 0) {
    throw new DomainError("INVALID_DECIMAL", "Target mass cannot be negative.", fieldPath);
  }
  if (targetMass.isZero()) {
    return {
      target: targetMass,
      displayableTarget: targetMass,
      relativeIncrementPct: null,
      plannedDeviationPct: null,
      effectiveUncertaintyPct: null,
      status: "not_applicable",
      diagnostics: [],
    };
  }
  if (targetMass.compare(parsedScale.capacity) > 0) {
    throw new DomainError(
      "SCALE_CAPACITY_EXCEEDED",
      `Target exceeds ${parsedScale.displayName}'s ${parsedScale.capacity.toSignificant()} g capacity.`,
      fieldPath,
    );
  }
  if (parsedScale.minimumLoad && targetMass.compare(parsedScale.minimumLoad) < 0) {
    throw new DomainError(
      "SCALE_BELOW_MINIMUM_LOAD",
      `Target is below ${parsedScale.displayName}'s ${parsedScale.minimumLoad.toSignificant()} g minimum load.`,
      fieldPath,
    );
  }

  const relativeIncrementPct = percent(parsedScale.readability, targetMass);
  const displayableTarget = targetMass.roundToIncrement(parsedScale.readability, "half_up");
  const plannedDeviationPct = percent(displayableTarget.subtract(targetMass).abs(), targetMass);
  const statuses = [classify(relativeIncrementPct), classify(plannedDeviationPct)];
  const diagnostics = [];
  let effectiveUncertaintyPct = null;

  if (parsedScale.repeatability && parsedScale.accuracy) {
    const halfReadability = parsedScale.readability.divide(ExactDecimal.fromInteger(2));
    const uncertainty = [halfReadability, parsedScale.repeatability, parsedScale.accuracy]
      .reduce((largest, value) => (value.compare(largest) > 0 ? value : largest));
    effectiveUncertaintyPct = percent(uncertainty, targetMass);
    statuses.push(classify(effectiveUncertaintyPct));
  } else {
    diagnostics.push(diagnostic(
      "SCALE_CAPABILITY_UNVERIFIED",
      "warning",
      `${parsedScale.displayName} has no verified accuracy and repeatability values.`,
      fieldPath,
    ));
  }

  const status = worstStatus(statuses);
  if (status === "poor") {
    diagnostics.push(diagnostic(
      "MEASUREMENT_FEASIBILITY_POOR",
      "warning",
      "This amount is poorly measurable on the selected scale. Use a larger batch or finer scale.",
      fieldPath,
    ));
  }

  return {
    target: targetMass,
    displayableTarget,
    relativeIncrementPct,
    plannedDeviationPct,
    effectiveUncertaintyPct,
    status,
    diagnostics,
  };
}
