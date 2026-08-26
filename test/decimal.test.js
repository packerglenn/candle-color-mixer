import test from "node:test";
import assert from "node:assert/strict";
import { ExactDecimal, percent } from "../src/domain/decimal.js";

test("decimal arithmetic remains exact for production values", () => {
  const wax = ExactDecimal.parse("100.000");
  const dyeLoad = ExactDecimal.parse("0.30");
  const dye = wax.multiply(dyeLoad).divide(100);
  assert.equal(dye.toSignificant(), "0.3");
  assert.equal(dye.multiply(ExactDecimal.parse("0.70")).toSignificant(), "0.21");
  assert.equal(dye.multiply(ExactDecimal.parse("0.25")).toSignificant(), "0.075");
  assert.equal(dye.multiply(ExactDecimal.parse("0.05")).toSignificant(), "0.015");
});

test("non-terminating division uses deterministic significant digits", () => {
  const fraction = ExactDecimal.parse("1.002").divide(
    ExactDecimal.parse("1.002").add(ExactDecimal.parse("19.004")),
  );
  assert.equal(fraction.toSignificant(24), "0.0500849745076477056882935");
});

test("half-up increment rounding matches a physical scale display", () => {
  const target = ExactDecimal.parse("0.015");
  assert.equal(target.roundToIncrement(ExactDecimal.parse("0.01")).toSignificant(), "0.02");
  assert.equal(target.roundToIncrement(ExactDecimal.parse("0.001")).toSignificant(), "0.015");
});

test("percent returns exact rational value", () => {
  assert.equal(
    percent(ExactDecimal.parse("0.01"), ExactDecimal.parse("0.015")).toSignificant(24),
    "66.6666666666666666666667",
  );
});

test("strict parser rejects unsafe production formats", () => {
  for (const invalid of ["1e-3", "NaN", "Infinity", "1,000", ".5", "5 g", "+1"]) {
    assert.throws(() => ExactDecimal.parse(invalid));
  }
});
