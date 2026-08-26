# Candle Color Mixer — Product and Engineering Specification

- **Repository:** `packerglenn/candle-color-mixer`
- **Status:** Approved for Version 1 implementation
- **Specification version:** 0.5.5
- **Date:** 2026-08-26
- **Primary use:** Pinewood Blooms small-batch wax color formulation
- **Initial delivery:** Static-first web application / installable PWA

---

## 1. Purpose

The Candle Color Mixer shall make wax-color production repeatable by answering two distinct questions:

1. **Calculation:** Given a fixed dye formula, wax formulation, and base-wax mass, what masses must the operator weigh?
2. **Recommendation:** Given a target color, what previously tested formula is the best empirical starting point?

Calculation is deterministic and may be exact within the declared numeric model. Color recommendation is empirical and shall expose uncertainty. The application shall never claim that an uncalibrated screen color mathematically determines a physical wax mixture.

The specification uses **shall** for a requirement, **should** for a strong recommendation, and **may** for an optional behavior.

## 2. Product boundary and release definitions

“Version 1” means only **Release 1.0 — Exact Formula Calculator**. Later releases are separately gated and shall not be implied by Version 1 acceptance.

### 2.1 Release 1.0 — Exact Formula Calculator

Release 1.0 shall provide:

- manufacturer formula-template selection;
- optional visual-target selection that maps to the nearest predefined color family and applies a bounded family-specific ratio adjustment;
- nearest W3C CSS named-color reference for the selected sRGB screen color;
- custom fixed-ratio formula entry;
- constrained selection within manufacturer ratio ranges;
- Freedom Pillar Wax batch-mass entry and a constrained three-level color-strength selector;
- exact component-mass calculation;
- direct-dye component calculation only;
- scale feasibility and representability warnings;
- visible manufacturer dye-temperature and mixing guidance;
- fragrance-oil volume calculation from an operator-entered US fl oz/lb ratio;
- a complete production weighing plan;
- immutable bundled reference data.

Release 1.0 shall not claim to calculate a physical cured-wax match from a HEX value or photograph. It may derive an explicitly experimental screen-space variation only through the bounded family models in Section 8.4.

The optional visual-target selector shall choose among existing predefined families using CIEDE2000 distance between illustrative sRGB anchors. Candidate eligibility shall be partitioned symmetrically at target CIE Lab chroma `sqrt(a² + b²) = 5`: a target below 5 may compare only with anchors below 5, while a target at or above 5 may compare only with anchors at or above 5. This narrow neutral region contains the Gray coal anchor while retaining visibly tinted near-white colors as chromatic. It also prevents a chromatic target from selecting an achromatic formula merely because the predefined chromatic anchors are sparse. Ties shall sort by template ID. After family selection, the selector shall derive ratios only through that family’s declared model in Section 8.4. It shall not introduce a dye absent from the seed family, mutate stored seed ratios, or automatically change the operator’s dye load. The selector shall be labeled experimental and shall state that it is not a calibrated cured-wax prediction.

### 2.2 Release 1.1 — Production Records

Release 1.1 shall add:

- IndexedDB persistence;
- formulation profiles and versioning;
- recipe and recipe-version management;
- production batches with target and actual measurements;
- atomic JSON backup, restore, and migration.

### 2.3 Release 1.2 — Calibration and Lookup

Release 1.2 shall add:

- standardized physical sample records;
- controlled color observations;
- CIE Lab and CIEDE2000 comparison;
- nearest verified recipe lookup within a compatible formulation and measurement context;
- deterministic recommendation confidence.

### 2.4 Release 1.3 — Photo Assistance

Release 1.3 may add controlled-photo capture and correction. Uncontrolled photos remain visual references and shall not support high-confidence recommendations.

### 2.5 Release 2 — Empirical Formula Generation

Interpolation, regression, or bounded search may be added only after sufficient physical data exists and a separate model-validation specification is approved. Until then, no-data behavior is `insufficient_data`.

## 3. Goals

The product shall:

- preserve dye ratios when scaling any supported batch size;
- use mass rather than pellet or chip count;
- identify amounts that cannot be weighed reliably;
- calculate every dye component as direct pure dye;
- record recipe intent separately from production outcome;
- retain enough immutable information to reconstruct a batch;
- compare compatible observed colors with CIEDE2000;
- return confidence and reason codes with every recommendation;
- remain useful without color prediction or a backend.

## 4. Non-goals

The following are outside Release 1.0 and are not implied by later architecture:

- cloud accounts or multi-user authentication;
- server-side storage;
- automatic repository writes;
- autonomous physical pigment prediction;
- spectral or Kubelka–Munk modeling;
- inventory purchasing;
- fragrance formulation optimization;
- printer or production-machine control;
- burn-safety certification.

Manufacturer dosage compliance shall never be labeled as candle or burn safety approval. Any product intended to burn requires the maker’s applicable safety and burn-testing process outside this application.

## 5. Source materials and provenance

### 5.1 Known dye system

The initial dye system is the Candle Shop 16-color solid candle dye kit:

1. White
2. Red
3. Yellow
4. Blue
5. Green
6. Dark blue
7. Brown
8. Orange
9. Violet
10. Purple
11. Aquamarine
12. Pink
13. Bright yellow
14. Bright lime
15. Bright pink
16. Black

Stable IDs shall be used, such as `candle-shop-red`. Display names are not identifiers.

### 5.2 Known base wax

- Manufacturer: American Soy Organics
- Product: Freedom Pillar Wax
- Initial ID: `aso-freedom-pillar-wax`
- Release 1 application: molded pillar candles

Release 1 shall display the product and manufacturer names separately and shall use “pillar” as the application preset. It shall not derive the wax identity from the manufacturer’s company name.

### 5.3 Known additive

- Supplier label: Direct Candle Supply
- Product: Vybar 103 / PB 165
- Initial ID: `vybar-103-pb165`

The Pinewood Blooms production dose is not yet known and shall not have a production default.

### 5.4 Manufacturer guidance transcription

The current source transcription says:

- the dyes are intended for beeswax, stearin, soy, palm, and paraffin-based waxes;
- they are not intended for gel wax;
- base-wax color affects the finished shade;
- dye should be added to fully melted wax;
- minimum dissolve temperature is approximately 152°F / 66.7°C;
- dye should not be heated above approximately 194°F / 90°C;
- recommended mixing time is approximately 1–2 minutes;
- excessive dye can negatively affect burning;
- dyes from different manufacturers should not be assumed compatible.

For 2.2 lb / 35.2 oz of soy, beeswax, or palm wax, the transcribed range is 0.08–0.20 oz dye:

```text
low  = 0.08 / 35.2 × 100 = 0.2272727…%
high = 0.20 / 35.2 × 100 = 0.5681818…%
```

For paraffin-based wax, the transcribed range is 0.07–0.10 oz:

```text
low  = 0.07 / 35.2 × 100 = 0.1988636…%
high = 0.10 / 35.2 × 100 = 0.2840909…%
```

These values are guidance, not guarantees. A `SourceEvidence` record shall retain the source type, image or document reference, transcription date, transcriber, and verification status. Seed data shall remain `unverified_transcription` until a second person checks it against the source material.

Release 1.0 shall show this process guidance beside the calculator inputs and repeat it in the production plan. The operator-facing sequence shall say to add dye only after the wax is fully melted, dissolve at no less than approximately 152°F / 66.7°C, avoid heating the dye above approximately 194°F / 90°C, and mix for approximately 1–2 minutes until completely dissolved. The UI shall identify these values as an unverified manufacturer transcription, shall not mislabel 152°F as the melting point of every supported wax, and shall remind the operator to follow the selected wax manufacturer’s and equipment manufacturer’s safety instructions.

## 6. Canonical terminology and mass basis

### 6.1 Mass terms

All production masses shall use grams internally.

- `baseWaxTargetG`: intended base-wax material, excluding pure dye, additives, and fragrance.
- `pureDyeTargetG`: total pure dye target.
- `additiveTargetG`: additive mass outside the base-wax basis.
- `fragranceTargetFlOz`: fragrance liquid volume in US fluid ounces.
- `fragranceTargetMl`: the same fragrance liquid volume in milliliters.
- `knownFormulationMassBeforeFragranceG`: base wax + pure dye + additives.
- `finishedFormulationTargetG`: exact finished mass when fragrance is absent; `null` when a fragrance target is specified only by volume.

Therefore:

```text
knownFormulationMassBeforeFragranceG =
    baseWaxTargetG
  + pureDyeTargetG
  + sum(additiveTargetG)

finishedFormulationTargetG =
  fragrance absent ? knownFormulationMassBeforeFragranceG : null
```

The UI shall show `baseWaxTargetG`, the known mass before fragrance, and the fragrance volume with unambiguous labels. It shall not claim an exact finished mass when fragrance density is unavailable.

### 6.2 Dye load

```text
dyeLoadPct = pureDyeTargetG / baseWaxTargetG × 100
pureDyeTargetG = baseWaxTargetG × dyeLoadPct / 100
```

### 6.3 Component mass

For component `i`:

```text
componentPureDyeTargetG[i] = pureDyeTargetG × componentRatio[i]
sum(componentRatio) = 1
```

Fixed ratios shall be non-negative, no greater than 1, unique by dye ID, and sum exactly to 1 in decimal arithmetic.

### 6.4 Additive and fragrance dosing

Vybar remains a percentage of base-wax mass:

```text
additiveTargetG = baseWaxTargetG × additiveLoadPct / 100
```

Fragrance shall use the operator-entered bottle ratio in **US fluid ounces per avoirdupois pound**. Release 1 intentionally interprets the supplied `1 oz/lb` instruction as `1 US fl oz/lb` because the product is a liquid and the operator has selected volume dosing.

```text
gramsPerPound          = 453.59237
millilitersPerUsFlOz   = 29.5735295625
fragranceBasisG        = baseWaxTargetG + additiveTargetG
fragranceBasisLb       = fragranceBasisG / gramsPerPound
fragranceTargetFlOz    = fragranceBasisLb × fragranceRatioFlOzPerLb
fragranceTargetMl      = fragranceTargetFlOz × millilitersPerUsFlOz
```

`fragranceRatioFlOzPerLb` is required whenever fragrance is enabled and shall be greater than zero. The UI shall make mL the primary fragrance production target and also show the equivalent US fl oz value. No density shall be requested or assumed. Consequently, fragrance mass and exact finished-formulation mass shall remain unavailable rather than being inferred from volume.

Every load field shall declare its basis. Release 1 supports `base_wax_mass` for Vybar and a US `fluid_ounces_per_wax_plus_additive_pound` ratio for fragrance; any other basis is a hard error.

### 6.5 Numeric representation

Production arithmetic shall not use binary floating-point as its source of truth.

- Persisted production decimals shall be JSON strings, for example `"0.015"`.
- Calculations shall use a tested arbitrary-precision decimal implementation.
- The production calculation context shall use 24 significant decimal digits and round-half-even for non-terminating operations unless a formula explicitly specifies another rule.
- Scale displayability alone shall use decimal round-half-up because masses are non-negative and the operator must receive a single deterministic displayed target.
- Inputs shall reject exponent notation, `NaN`, infinity, commas, and unit suffixes.
- Entered target and actual strings may retain meaningful trailing zeros; derived strings shall use plain decimal notation with no exponent or unnecessary leading zeros.
- Display rounding shall never overwrite canonical values.
- Color-science calculations may use IEEE-754 numbers because their tolerances are explicitly tested.

## 7. Formula templates, recipes, and batches

### 7.1 Manufacturer formula template

A `FormulaTemplate` represents source guidance. It contains a dye system and fixed or constrained ratios. It shall not contain:

- a Pinewood Blooms formulation profile;
- an asserted physical target Lab value;
- a verified production status;
- a silently selected dye load.

Release 1 shall provide only these three explicitly labeled pillar color-strength presets:

| UI label | Relative dye amount | Pure dye load |
|---|---:|---:|
| Regular | 100% | 0.50% of base wax |
| Medium | 90% | 0.45% of base wax |
| Light | 80% | 0.40% of base wax |

Regular shall be the default. “Relative dye amount” describes linear dosage relative to the 0.50% Regular preset; it shall not be presented as a linear prediction of perceived or cured color intensity. All three loads remain below the transcribed solid-dye maximum of approximately `0.568%`. They are engineering starting points, not calibrated production values or burn-safety approvals.

### 7.2 Recipe and recipe version

A `Recipe` is stable identity and metadata. A `RecipeVersion` is immutable production intent and shall contain:

- recipe ID and integer version;
- exact formulation-profile version reference;
- optional originating formula-template version reference;
- resolved fixed component ratios;
- selected dye load;
- optional target-color version reference;
- process targets;
- source, verification status, and notes.

Editing production intent creates a new version. Existing versions and batches shall never be rewritten.

### 7.3 Batch

A `Batch` records what was planned and what actually happened. It shall reference immutable versions or embed an immutable snapshot sufficient to survive later deletion of optional library records.

A batch may reference a recipe version or contain an ad-hoc formula snapshot. It shall never ambiguously reference “the current recipe.”

Exactly one of `recipeVersionRef` and `adHocFormulaSnapshot` shall be non-null. Every material or dye use shall provide either a lot ID or a non-empty `lotUnknownReason`; omission is not equivalent to “unknown.”

### 7.4 Classification dimensions

The following concepts shall remain separate.

`sourceType`:

- `manufacturer`
- `pinewood_blooms`
- `engine_generated`
- `imported`

`verificationStatus`:

- `untested`
- `testing`
- `verified`
- `deprecated`

`recommendationConfidence`:

- `exact_verified_recipe`
- `high`
- `medium`
- `experimental`
- `insufficient_data`

`measurementQuality`:

- `visual_only`
- `photo_uncontrolled`
- `photo_controlled`
- `photo_calibrated`
- `colorimeter_verified`

No value from one dimension shall be stored in another.

## 8. Fixed and range formula templates

### 8.1 Seed formulas

| Template | Components |
|---|---|
| Raspberry | Red 70%, Blue 25%, White 5% |
| Coral | Red 50%, Yellow 35%, White 15% |
| Turquoise | Green 80–85%, Blue = 95% − Green, White 5% |
| Lime | Green 25%, Bright yellow 70%, White 5% |
| Olive | Green 80–90%, Yellow = 100% − Green |
| Gray coal | White 93–95%, Black = 100% − White |

Only seven of the 16 kit dyes occur in these six transcribed manufacturer formulas: White, Red, Blue, Yellow, Green, Bright yellow, and Black. This is not evidence that the other nine dyes are unnecessary or interchangeable with primary-color mixtures. Release 1 shall not infer physical dye anchors from display names alone. Dark blue, Brown, Orange, Violet, Purple, Aquamarine, Pink, Bright lime, and Bright pink remain available to custom formulas but require controlled wax samples or trustworthy manufacturer swatches before they may become visual-target anchors.

### 8.2 Typed constraints

Arbitrary expressions shall never be evaluated from JSON. A range template shall use a typed complement constraint:

```json
{
  "kind": "bounded_complement",
  "variableDyeId": "candle-shop-green",
  "variableMinRatio": "0.80",
  "variableMaxRatio": "0.85",
  "derivedDyeId": "candle-shop-blue",
  "complementTotalRatio": "0.95"
}
```

For any selected variable ratio `v`:

```text
derivedRatio = complementTotalRatio - v
```

The engine shall validate both selected and derived bounds. When the operator accepts a range formula, the resulting recipe or calculation snapshot shall store resolved fixed ratios, not an unresolved range.

### 8.3 Midpoints

Midpoint selection is deterministic:

```text
midpoint = (minimum + maximum) / 2
```

Defaults are:

- Turquoise: Green 82.5%, Blue 12.5%, White 5%;
- Olive: Green 85%, Yellow 15%;
- Gray coal: White 94%, Black 6%.

The UI shall label a midpoint as an application-selected midpoint, not an exact manufacturer formula.

### 8.4 Bounded visual-family adjustment

Each screen anchor shall preserve its resolved seed formula exactly. For another screen color assigned to the same family, the engine may adjust only the dyes declared by that family’s immutable `visualAdjustmentModel`. Color-space calculations may use IEEE-754 per Section 6.5; emitted production ratios shall be decimal strings.

Let `(H₀, S₀, V₀)` be the anchor converted from sRGB to HSV and `(H, S, V)` the selected screen color. Hue difference shall use the signed shortest circular distance:

```text
ΔH = ((H - H₀ + 540) mod 360) - 180
```

For `two_color_plus_tint`, with baseline primary `p₀`, secondary `s₀`, tint `t₀`, and declared model constants:

```text
t = clamp(t₀ + (S₀ - S) × desaturationToTint
             + (V - V₀) × brightnessToTint,
          minimumTintRatio, maximumTintRatio)

primaryShare = clamp(p₀ / (p₀ + s₀)
                     + hueDirection × ΔH × hueShiftPerDegree,
                     minimumPrimaryShare, maximumPrimaryShare)

primary   = quantize6((1 - t) × primaryShare)
secondary = 1 - t - primary
```

For `two_color`:

```text
primary   = quantize6(clamp(p₀ + hueDirection × ΔH × hueShiftPerDegree,
                            minimumPrimaryRatio, maximumPrimaryRatio))
secondary = 1 - primary
```

For `neutral_value`:

```text
dark  = quantize6(clamp(dark₀ + (V₀ - V) × darkeningPerValue,
                        minimumDarkRatio, maximumDarkRatio))
light = 1 - dark
```

`quantize6(x)` means deterministic decimal round-half-even to six ratio decimal places. Complement components shall be derived by exact decimal subtraction after quantization. Every output component shall be in `[0, 1]`, component ratios shall total exactly `1`, and the family’s stored seed data shall remain unchanged. The UI and calculation result shall retain `SCREEN_TARGET_EXPERIMENTAL`; the model is a navigation aid pending cured-wax calibration, not evidence that the screen target will be reproduced physically.

## 9. Direct-dye dosing

Every supported dye component shall be measured as direct dye. The application shall not expose a dosing-method selector or accept a concentrate strength.

```text
targetGrossDoseG = targetPureDyeG
```

For later actual batch records:

```text
actualPureDyeG = actualGrossDoseG
actualBaseWaxG = actualBaseWaxGMeasured
actualTotalPureDyeG = sum(actualPureDyeG)
actualDyeLoadPct = actualTotalPureDyeG / actualBaseWaxG × 100
actualFinishedFormulationG =
    actualBaseWaxG
  + actualTotalPureDyeG
  + sum(actualAdditiveG)
  + actualFragranceG
```

If `actualBaseWaxG` is zero, actual dye load is undefined and the batch cannot be completed.

## 10. Scale measurement model

Readability is not the same as accuracy, repeatability, or actual dosing error.

### 10.1 Scale profile

A scale profile shall contain:

- `readabilityG`;
- `capacityG`;
- optional `minimumLoadG`;
- optional `verifiedRepeatabilityG` as an absolute bound;
- optional `verifiedAccuracyG` as an absolute bound;
- calibration/check date and status.

All populated values shall be greater than zero, except an explicitly supported zero minimum load.

### 10.2 Relative increment

```text
relativeIncrementPct = readabilityG / targetGrossDoseG × 100
```

This expresses sensitivity to one display increment. It shall not be named “error.”

Default classification:

- `≤ 2%`: good;
- `> 2% and ≤ 5%`: acceptable;
- `> 5% and ≤ 10%`: caution;
- `> 10%`: poor.

### 10.3 Target representability

Using decimal round-half-up for positive masses:

```text
displayableTargetG =
  roundHalfUp(targetGrossDoseG / readabilityG) × readabilityG

plannedDeviationPct =
  abs(displayableTargetG - targetGrossDoseG) / targetGrossDoseG × 100
```

The weighing plan shall show both the mathematical target and displayable target. It shall never silently substitute one for the other.

### 10.4 Verified uncertainty

When accuracy and repeatability have both been verified:

```text
effectiveUncertaintyG =
  max(readabilityG / 2, verifiedRepeatabilityG, verifiedAccuracyG)

effectiveUncertaintyPct =
  effectiveUncertaintyG / targetGrossDoseG × 100
```

This is a conservative application metric, not a metrology certificate. If either verified value is missing or stale, effective uncertainty is `unknown` and the UI shall show `scale_capability_unverified`.

### 10.5 Feasibility outcome

The displayed feasibility is the worst classification among:

- relative increment;
- planned deviation;
- effective uncertainty, when known.

Capacity overflow and below-minimum-load are hard errors for the selected scale. Poor feasibility is a warning because the user may choose another scale or a larger batch.

### 10.6 Zero target

A zero component target shall not be sent through percentage calculations. It shall return `not_applicable`, with no divide-by-zero result.

### 10.7 Concentrate-strength helper

For maximum relative increment `E` expressed as a fraction:

```text
requiredGrossDoseG ≥ readabilityG / E
maximumConcentrateFraction ≤ targetPureDyeG / requiredGrossDoseG
```

This helper optimizes relative increment only. It shall still run scale-capacity and minimum-load checks.

## 11. Deterministic calculation algorithm

The calculation module shall be pure and independent from UI and storage.

```text
calculateWeighingPlan(input) -> CalculationResult
```

Processing order:

1. Parse and validate all decimal strings and references.
2. Resolve a fixed formula; range templates shall be resolved first.
3. Calculate total pure dye.
4. Calculate each component’s target pure-dye mass.
5. Treat each component target as its direct-dye weighing target.
6. Calculate additives.
7. Convert wax + additive mass to pounds, apply the fragrance fl oz/lb ratio, and convert the result to mL.
8. Calculate known formulation mass before fragrance; return exact finished mass only when fragrance is absent.
9. Evaluate each mass-weighing target against the selected scale; do not represent volume as a scale target.
10. Return canonical targets, displayable targets, warnings, and reason codes.

The same canonical input and reference-data versions shall produce byte-equivalent canonical result data. Display strings may vary only by locale and configured display precision.

## 12. Worked reference cases

### 12.1 Raspberry, direct dye

For 100.000 g Freedom Pillar Wax at the default Regular 0.50% pillar dye preset:

```text
total dye = 100 × 0.005 = 0.500 g
red        = 0.500 × 0.70 = 0.350 g
blue       = 0.500 × 0.25 = 0.125 g
white      = 0.500 × 0.05 = 0.025 g
finished mass before additives/fragrance = 100.500 g
```

At 250.000 g base wax:

```text
total dye = 1.2500 g
red       = 0.8750 g
blue      = 0.3125 g
white     = 0.0625 g
```

### 12.2 Scale example

For a 0.015 g target on a 0.01 g-readability scale:

```text
relative increment = 0.01 / 0.015 × 100 = 66.666…%
displayable target  = roundHalfUp(1.5) × 0.01 = 0.02 g
planned deviation   = |0.02 - 0.015| / 0.015 × 100 = 33.333…%
```

The result is `poor`; a larger batch or finer scale is recommended.

### 12.3 Fragrance volume

For 100.000 g base wax, 0.500 g Vybar, and a bottle ratio interpreted as 1 US fl oz/lb:

```text
fragrance basis  = 100.000 + 0.500 = 100.500 g
basis in pounds  = 100.500 / 453.59237 = 0.221564573… lb
fragrance fl oz  = 0.221564573… × 1 = 0.221564573… US fl oz
fragrance volume = 0.221564573… × 29.5735295625 = 6.552446464… mL
```

The production target is the calculated mL value. Known mass before fragrance is 101.000 g when the 0.500 g dye from Section 12.1 is included; exact finished mass remains unavailable without density.

## 13. Color science boundary

### 13.1 Target inputs

Release 1.0 may accept an sRGB/HEX screen reference solely to select the nearest predefined family and drive its bounded Section 8.4 adjustment model. Later releases may additionally accept:

- a named manufacturer swatch with no asserted coordinates;
- a measured physical target;
- a screen sRGB/HEX reference;
- a controlled or uncontrolled photograph;
- a previously saved target-color version.

### 13.2 Standardized screen-color name

The color-wheel UI and production plan shall show a human-readable screen-color reference independently from the wax-family match. It shall use the opaque named sRGB colors defined by [W3C CSS Color 4](https://www.w3.org/TR/css-color-4/#named-colors).

- Standard keyword aliases sharing one sRGB value shall be consolidated into one display record, producing 139 unique opaque reference values.
- The selected HEX value shall be compared with those references in CIE Lab using CIEDE2000.
- Exact equality shall be labeled **Exact CSS named screen color**; otherwise the result shall be labeled **Nearest CSS named screen color**.
- The UI shall display the readable name, standard reference HEX, and ΔE00 distance.
- Ties shall sort by the lowercase CSS keyword.
- The exact selected HEX shall remain the production-plan identifier; the nearest name shall not replace it.
- The CSS name describes an sRGB screen reference only. It shall not be labeled Pantone, Munsell, an ISCC-NBS physical designation, or proof of a cured-wax match.

The standardized screen name and the nearest wax family are separate outputs and may have different names.

### 13.3 Comparison space

Compatible measured observations shall be compared in CIE L\*a\*b\* using CIEDE2000 ΔE00. The default context is D65 and 2° observer.

Lab values shall be compared only when illuminant, observer, measurement geometry, backing, and sample protocol are compatible. Release 1.2 shall reject incompatible white points rather than silently adapting them. A future documented chromatic-adaptation feature may relax this rule.

### 13.4 Prohibited prediction

The following shall not be represented as a physical pigment model:

```text
LabMix = sum(componentRatio × componentLab)
RGBMix = average(componentRGB)
```

A screen-derived Lab target is a cross-media visual reference, not proof that a cured wax sample will match under physical viewing conditions.

### 13.5 Color-science verification

The implementation shall use a tested library or a fully unit-tested implementation. Tests shall cover:

- sRGB companding boundaries;
- sRGB black and white reference values;
- at least three saturated primary/secondary references;
- CIEDE2000 identity and symmetry;
- the published Sharma CIEDE2000 reference pairs, including expected values 2.0425, 2.8615, 3.4412, and 1.0000 within `1e-4`;
- hue-angle wraparound cases;
- rejection of incomplete or incompatible Lab metadata.

## 14. Calibration and physical sample protocol

Color evidence is comparable only when both formulation and observation context are compatible.

### 14.1 Versioned formulation profile

A `FormulationProfileVersion` shall identify:

- base-wax material version;
- whether wax lot is strict, advisory, or ignored;
- additive material versions and exact loads;
- fragrance material/version and load, or explicit `none`;
- dye-system version;
- target dye-add temperature;
- target mixing duration;
- target pour temperature when applicable;
- cure interval;
- sample-protocol version.

Any change to a field that can affect appearance creates a new formulation-profile version. Profiles are immutable after first batch use.

### 14.2 Standard sample protocol

Before controlled color measurements begin, Pinewood Blooms shall approve a `SampleProtocolVersion` containing:

- sample mold or coupon ID;
- nominal thickness and tolerance;
- nominal diameter or dimensions;
- surface presented for measurement;
- backing material and color;
- mold material or release treatment;
- target pour mass;
- cooling location and ambient-temperature range;
- permitted airflow and light exposure during cure;
- cure duration and tolerance;
- conditioning temperature before measurement;
- measurement locations or sampling pattern;
- minimum number of readings per sample;
- glare-control procedure;
- photograph framing rules when applicable.

Measurements from flower petals or other production geometry shall not be treated as directly interchangeable with coupon measurements unless a validation study establishes equivalence.

### 14.3 Calibration sequence

Calibration shall be staged:

1. One undyed blank for each formulation-profile version.
2. One nominal cured sample for each dye at an explicitly selected load.
3. Low, nominal, and high strength points for foundational dyes.
4. Replicate independent batches for recipes intended to receive high confidence.
5. Ongoing production observations.

Exploratory loads of 0.24% and 0.35% remain useful comparison samples outside the streamlined UI. Release 1 exposes Regular 0.50%, Medium 0.45%, and Light 0.40% to avoid unnecessarily pale starting samples while allowing controlled strength reduction. These presets remain within the transcribed solid-dye range applicable to the manufacturer-described wax composition, but none is a verified Pinewood Blooms production standard until physical samples and burn tests are approved.

### 14.4 Observation rules

An official cured observation shall record:

- exact batch ID;
- sample-protocol version;
- age at measurement;
- device and device-profile version;
- lighting profile and measurement geometry;
- backing;
- individual readings and aggregation method;
- measurement quality;
- measured Lab with illuminant and observer;
- optional photographs;
- operator rating and notes.

At least three readings from the prescribed locations are required for a controlled observation. The stored aggregate shall not replace the raw readings.

### 14.5 Replication requirement

“Independent batch” means a separately weighed, melted, mixed, poured, and cured production attempt. Multiple readings from one coupon are not independent batches.

A qualifying batch uses the exact recipe and formulation-profile versions, follows the sample protocol within its tolerances, has no disqualifying process or measurement deviation, and is evaluated at the prescribed cure interval.

Color outcome alone can never make a batch non-qualifying. Invalidating a process or measurement requires a recorded reason code and note; the original observation remains retained.

`exact_verified_recipe` requires at least three qualifying independent successful batches, including at least two controlled measured observations. Pinewood Blooms may set a stricter rule later.

### 14.6 Cure and aging

The standard evaluation time shall be configured and recorded. Measurements taken early or late remain historical observations but are non-qualifying for confidence unless they fall within the protocol tolerance.

If testing shows material color drift or frosting after the standard interval, the protocol shall add later observation checkpoints rather than silently replacing the original observation.

## 15. Recommendation and confidence rules

Recommendation behavior begins in Release 1.2.

### 15.1 Compatibility key

Candidate lookup shall first require compatible:

- formulation-profile version or an explicitly declared compatibility mapping;
- dye system;
- sample-protocol version;
- Lab illuminant and observer;
- measurement geometry and backing;
- cure-time tolerance.

Lot mismatches, scale capability, and process deviations shall be handled by deterministic exclusions or confidence caps defined below.

### 15.2 Candidate ranking

After compatibility filtering, candidates shall be ordered by:

1. exact target-color version and exact verified recipe version;
2. ascending ΔE00 from compatible controlled observations;
3. descending qualifying independent batch count;
4. descending measurement-quality rank;
5. descending most-recent qualifying observation timestamp;
6. ascending recipe ID and version as stable tie-breakers.

Manufacturer templates with no measured result are suggestions, not measured candidates, and rank after compatible empirical results.

### 15.3 Confidence assignment

`exact_verified_recipe` requires all of the following:

- exact target-color version;
- exact formulation-profile version;
- approved recipe version;
- at least three qualifying successful independent batches;
- at least two compatible controlled measured observations;
- every qualifying measured observation within the configured operational ΔE00 threshold;
- no unresolved material, lot, process, scale, or cure warning.

`high` requires:

- same formulation-profile version;
- at least two qualifying controlled observations;
- nearest aggregate result within the operational ΔE00 threshold;
- no critical mismatch or unverified scale capability.

Until Pinewood Blooms approves an operational ΔE00 threshold, confidence is capped at `medium`.

`medium` applies when useful same-profile evidence exists but only one controlled observation, repeated visual evidence, or a non-critical lot/process mismatch remains.

`experimental` applies to:

- manufacturer templates without Pinewood Blooms verification;
- cross-profile reuse;
- interpolation or extrapolation;
- uncontrolled-photo targets;
- unverified measurement capability;
- new dye combinations without qualifying observations.

`insufficient_data` applies when no defensible candidate or explicitly supported starting template exists.

### 15.4 Target-source confidence caps

- Compatible measured physical target: no additional cap.
- Calibrated photographic target: maximum `high`.
- Screen sRGB/HEX target: maximum `medium`.
- Uncontrolled photograph: maximum `experimental`.
- Named swatch without coordinates: template lookup only; no ΔE00 claim.

### 15.5 Required reasons

Every recommendation shall return a confidence value and stable reason codes. Example:

```json
{
  "recommendationConfidence": "experimental",
  "reasonCodes": [
    "TARGET_PHOTO_UNCONTROLLED",
    "NO_COMPATIBLE_MEASURED_RECIPE",
    "MANUFACTURER_TEMPLATE_ONLY"
  ]
}
```

Human-readable text is derived from reason codes and is not persisted as the sole explanation.

### 15.6 Operational threshold

The application may initially display general ΔE00 guidance, but no operational pass/fail threshold shall become active until Pinewood Blooms records and approves it in settings. Operator approval remains a separate field and shall not be inferred solely from ΔE00.

## 16. Domain data model

### 16.1 Core immutable/versioned entities

- `SourceEvidence`
- `DyeSystemVersion`
- `DyeVersion`
- `MaterialVersion`
- `FormulaTemplateVersion`
- `FormulationProfileVersion`
- `SampleProtocolVersion`
- `TargetColorVersion`
- `Recipe`
- `RecipeVersion`
- `ScaleProfileVersion`
- `LightingProfileVersion`
- `MeasurementDeviceProfileVersion`

### 16.2 Operational entities

- `MaterialLot`
- `DyeLot`
- `ConcentrateLot`
- `Batch`
- `ColorObservation`
- `AppSettings`

### 16.3 Common persisted fields

Every entity shall contain:

- `schemaVersion` as a positive integer;
- `id` as a stable string;
- `createdUtc` and `modifiedUtc` as ISO-8601 UTC strings;
- `notes` as string or null.

Versioned entities also contain a positive integer `version`. IDs and versions are unique together. Once referenced by an operational entity, a versioned entity is immutable; retirement changes status in a new version or separate registry record.

### 16.4 Deletion behavior

Referenced records shall be retired, not physically deleted through normal UI. Export shall include all transitive references needed to reconstruct every included batch.

## 17. Normative JSON contracts

Examples below are normative for field meaning and numeric representation. Formal JSON Schemas shall be generated before Release 1.1 implementation.

### 17.1 Formula template version

```json
{
  "schemaVersion": 2,
  "id": "manufacturer-raspberry",
  "version": 1,
  "displayName": "Raspberry",
  "sourceType": "manufacturer",
  "verificationStatus": "untested",
  "dyeSystemRef": { "id": "candle-shop-16-color-kit", "version": 1 },
  "sourceEvidenceRef": { "id": "booklet-transcription-001", "version": 1 },
  "formulaKind": "fixed",
  "components": [
    { "dyeRef": { "id": "candle-shop-red", "version": 1 }, "ratio": "0.70" },
    { "dyeRef": { "id": "candle-shop-blue", "version": 1 }, "ratio": "0.25" },
    { "dyeRef": { "id": "candle-shop-white", "version": 1 }, "ratio": "0.05" }
  ],
  "createdUtc": "2026-08-26T12:00:00Z",
  "modifiedUtc": "2026-08-26T12:00:00Z",
  "notes": "Ratios transcribed from manufacturer material; no physical target coordinates asserted."
}
```

### 17.2 Recipe version

```json
{
  "schemaVersion": 2,
  "id": "pb-raspberry",
  "version": 1,
  "displayName": "Pinewood Blooms Raspberry",
  "sourceType": "pinewood_blooms",
  "verificationStatus": "testing",
  "derivedFromTemplateRef": { "id": "manufacturer-raspberry", "version": 1 },
  "formulationProfileRef": { "id": "pb-freedom-vybar", "version": 1 },
  "targetColorRef": null,
  "dyeLoadPct": "0.30",
  "components": [
    { "dyeRef": { "id": "candle-shop-red", "version": 1 }, "ratio": "0.70" },
    { "dyeRef": { "id": "candle-shop-blue", "version": 1 }, "ratio": "0.25" },
    { "dyeRef": { "id": "candle-shop-white", "version": 1 }, "ratio": "0.05" }
  ],
  "processTargets": {
    "dyeAddTemperatureF": null,
    "mixSeconds": null,
    "pourTemperatureF": null
  },
  "createdUtc": "2026-08-26T12:00:00Z",
  "modifiedUtc": "2026-08-26T12:00:00Z",
  "notes": "Unverified starting recipe. Null process fields require operator input."
}
```

### 17.3 Scale profile version

```json
{
  "schemaVersion": 2,
  "id": "shop-scale-001",
  "version": 1,
  "displayName": "Pinewood Blooms Precision Scale",
  "readabilityG": "0.001",
  "capacityG": "50",
  "minimumLoadG": null,
  "verifiedRepeatabilityG": null,
  "verifiedAccuracyG": null,
  "verificationStatus": "unverified",
  "lastCheckedUtc": null,
  "createdUtc": "2026-08-26T12:00:00Z",
  "modifiedUtc": "2026-08-26T12:00:00Z",
  "notes": null
}
```

### 17.4 Direct-dye plan component

```json
{
  "dyeRef": { "id": "candle-shop-red", "version": 1 },
  "dyeLotId": "lot-red-2026-01",
  "ratio": "0.70",
  "targetPureDyeG": "0.210",
  "targetWeighingG": "0.210",
  "scaleProfileRef": { "id": "shop-scale-001", "version": 1 }
}
```

### 17.5 Batch

```json
{
  "schemaVersion": 2,
  "id": "batch-2026-08-26-001",
  "recipeVersionRef": { "id": "pb-raspberry", "version": 1 },
  "adHocFormulaSnapshot": null,
  "formulationProfileRef": { "id": "pb-freedom-vybar", "version": 1 },
  "targetColorRef": null,
  "baseWax": {
    "materialRef": { "id": "aso-freedom-pillar-wax", "version": 1 },
    "lotId": "wax-lot-2026-04",
    "targetG": "100.000",
    "actualG": "100.001",
    "scaleProfileRef": { "id": "shop-batch-scale", "version": 1 }
  },
  "dyeMeasurements": [
    {
      "dyeRef": { "id": "candle-shop-red", "version": 1 },
      "dyeLotId": "lot-red-2026-01",
      "ratio": "0.70",
      "targetG": "0.210",
      "actualG": "0.211",
      "scaleProfileRef": { "id": "shop-scale-001", "version": 1 }
    },
    {
      "dyeRef": { "id": "candle-shop-blue", "version": 1 },
      "dyeLotId": "lot-blue-2026-01",
      "ratio": "0.25",
      "targetG": "0.075",
      "actualG": "0.075",
      "scaleProfileRef": { "id": "shop-scale-001", "version": 1 }
    },
    {
      "dyeRef": { "id": "candle-shop-white", "version": 1 },
      "dyeLotId": "lot-white-2026-01",
      "ratio": "0.05",
      "targetG": "0.015",
      "actualG": "0.015",
      "scaleProfileRef": { "id": "shop-scale-001", "version": 1 }
    }
  ],
  "additiveMeasurements": [
    {
      "materialRef": { "id": "vybar-103-pb165", "version": 1 },
      "lotId": "vybar-lot-001",
      "loadBasis": "base_wax_mass",
      "targetLoadPct": "0.50",
      "targetG": "0.500",
      "actualG": "0.501",
      "scaleProfileRef": { "id": "shop-scale-001", "version": 1 }
    }
  ],
  "fragranceMeasurement": null,
  "processActuals": {
    "waxMeltTemperatureF": "180.0",
    "dyeAddTemperatureF": "170.0",
    "additiveAddTemperatureF": null,
    "mixSeconds": 90,
    "pourTemperatureF": "145.0",
    "ambientTemperatureF": "72.0",
    "coolingNotes": null
  },
  "derivedActuals": {
    "baseWaxG": "100.001",
    "pureDyeG": "0.301",
    "dyeLoadPct": "0.300996990030099699003010",
    "finishedFormulationG": "100.803"
  },
  "resultStatus": "pending_observation",
  "operatorRating": null,
  "createdUtc": "2026-08-26T12:00:00Z",
  "modifiedUtc": "2026-08-26T12:00:00Z",
  "notes": null
}
```

### 17.6 Color observation

```json
{
  "schemaVersion": 2,
  "id": "obs-2026-08-27-001",
  "batchId": "batch-2026-08-26-001",
  "sampleProtocolRef": { "id": "pb-coupon", "version": 1 },
  "method": "colorimeter",
  "measurementQuality": "colorimeter_verified",
  "deviceProfileRef": { "id": "shop-colorimeter", "version": 1 },
  "lightingProfileRef": null,
  "ageHours": "24.2",
  "readingsLab": [
    { "l": 62.1, "a": 35.4, "b": 11.2 },
    { "l": 62.0, "a": 35.6, "b": 11.1 },
    { "l": 62.2, "a": 35.5, "b": 11.3 }
  ],
  "aggregateLab": {
    "method": "arithmetic_mean",
    "l": 62.1,
    "a": 35.5,
    "b": 11.2,
    "illuminant": "D65",
    "observer": "2deg",
    "geometry": "device_profile"
  },
  "targetDeltaE00": null,
  "qualifying": true,
  "createdUtc": "2026-08-27T12:12:00Z",
  "modifiedUtc": "2026-08-27T12:12:00Z",
  "notes": null
}
```

## 18. Validation and diagnostics

### 18.1 Hard errors

Calculation shall fail when:

- a required decimal is absent, malformed, non-finite, or negative where prohibited;
- base wax is not greater than zero;
- dye load is negative;
- a ratio is outside `[0, 1]`;
- fixed ratios do not sum exactly to 1;
- a dye appears more than once;
- a referenced record/version does not exist or is incompatible;
- a range selection violates its typed constraint;
- a dosing-method or concentration configuration is supplied to the direct-dye-only calculator;
- a scale value is invalid;
- a gross dose exceeds scale capacity or is below a configured minimum load;
- a persisted derived value fails recomputation tolerance;
- an unsupported schema version is loaded;
- a required formulation snapshot is missing.

### 18.2 Warnings

Calculation may continue with explicit warnings for:

- dye load outside source guidance;
- poor measurement feasibility;
- unverified or stale scale capability;
- different material lot where the profile permits it;
- unverified manufacturer transcription;
- process targets that remain null;
- cross-manufacturer mixture marked experimental;
- no compatible calibration;
- profile, additive, fragrance, process, cure, or sample mismatch;
- uncontrolled photographic input;
- interpolation or extrapolation;
- observation outside cure tolerance.

Every diagnostic shall have a stable code, severity, affected field path, and human-readable message.

For production-domain derived strings, “fails recomputation tolerance” means the stored value does not exactly equal the canonical result recomputed with Section 6.5. Color-domain tolerances remain test-specific.

### 18.3 Acknowledgements

Warnings requiring acknowledgement shall be stored on the batch or approval event with diagnostic code, timestamp, and operator note. Acknowledgement does not remove the warning from history.

### 18.4 Minimum diagnostic registry

The initial implementation shall define, at minimum:

| Code | Default severity | Meaning |
|---|---|---|
| `INVALID_DECIMAL` | error | Production number failed canonical parsing |
| `INVALID_RATIO_SUM` | error | Fixed ratios do not total 1 |
| `DUPLICATE_DYE_COMPONENT` | error | Dye appears more than once |
| `REFERENCE_NOT_FOUND` | error | ID/version cannot be resolved |
| `INVALID_RANGE_SELECTION` | error | Typed range constraint failed |
| `UNSUPPORTED_DOSING_CONFIGURATION` | error | Non-direct dosing configuration was supplied to a direct-dye-only calculator |
| `SCALE_CAPACITY_EXCEEDED` | error | Requested weighing exceeds selected scale |
| `SCALE_BELOW_MINIMUM_LOAD` | error | Requested weighing is below selected scale minimum |
| `DERIVED_VALUE_MISMATCH` | error | Persisted derived value differs from canonical recomputation |
| `SCALE_CAPABILITY_UNVERIFIED` | warning | Accuracy or repeatability is absent/stale |
| `MEASUREMENT_FEASIBILITY_POOR` | warning | Worst scale metric exceeds 10% |
| `DYE_LOAD_OUTSIDE_GUIDANCE` | warning | Load is outside applicable source range |
| `SOURCE_TRANSCRIPTION_UNVERIFIED` | warning | Seed evidence lacks second-person verification |
| `SCREEN_TARGET_EXPERIMENTAL` | warning | Screen color selected a bounded, uncalibrated variation within a predefined family |
| `MATERIAL_LOT_UNKNOWN` | warning | Required lot was explicitly unavailable |
| `PROCESS_VALUE_MISSING` | warning | Applicable process target or actual was not recorded |
| `FORMULATION_MISMATCH` | warning | Evidence comes from another formulation context |
| `TARGET_PHOTO_UNCONTROLLED` | warning | Target came from uncontrolled photography |
| `INSUFFICIENT_CALIBRATION_DATA` | info | No defensible empirical candidate exists |

Severity may be increased by policy but shall not be reduced without a specification version change.

## 19. User workflows

### 19.1 Release 1.0 calculation

1. Select a formula template or enter fixed ratios.
2. Resolve any range control.
3. Enter base-wax target and dye load.
4. Select the scale used for each weighing; wax and dye may use different scales.
5. Review mathematical and displayable targets.
6. Resolve hard errors and acknowledge applicable warnings.
7. Use the production weighing plan.

Release 1.0 shall not label this operation “Create Color.” The screen name is **Calculate Formula**.

### 19.2 Record a batch

1. Start from a recipe version or ad-hoc formula snapshot.
2. Save the calculation snapshot.
3. Record actual direct-dye masses, lots, and process values.
4. Recompute actual pure dye, dye load, and total mass.
5. Complete production with `pending_observation` status.
6. Add cured observations later without rewriting production values.

### 19.3 Find a target color

In Release 1.2:

1. Select or measure a target with declared source quality.
2. Select a formulation-profile version.
3. Filter to compatible observations.
4. Rank deterministic candidates.
5. Display recipe, ΔE00 where valid, confidence, and reasons.
6. If no defensible result exists, return `insufficient_data` or a clearly labeled manufacturer template.

No novel mixture shall be generated in Releases 1.x.

## 20. Persistence, backup, and migration

### 20.1 Reference data

Bundled dyes, materials, source evidence, and formula templates shall be immutable source-controlled JSON.

### 20.2 Runtime data

Release 1.1 shall use IndexedDB for structured runtime data and optional image blobs. The application shall:

- detect unavailable storage and fail visibly;
- use transactions for multi-entity writes;
- surface quota errors;
- display the most recent successful backup time;
- remind the user to export when unbacked-up production data exists;
- never imply that browser-local storage is a durable backup.

### 20.3 Export

An export shall contain:

- export schema version;
- application version;
- exported UTC timestamp;
- all selected records;
- all transitive immutable references;
- checksums for binary attachments;
- an entity-count manifest.

### 20.4 Import

Import shall be two-phase:

1. Parse, validate, migrate in memory, resolve references, and present a summary.
2. Commit atomically only after successful validation and user confirmation.

Import modes shall be explicit: `replace_all` or `merge`. Merge conflicts are resolved by exact ID/version/content equality; differing content under the same immutable ID/version is a hard conflict and shall never be silently overwritten.

The source file remains unchanged. Failed import or migration shall leave current data unchanged.

## 21. Architecture

Suggested modules:

- `decimal-domain`: decimal parsing, canonical formatting, exact arithmetic;
- `formula-engine`: ranges, ratios, dye loads, components;
- `dose-engine`: direct-dye component targets;
- `scale-engine`: representability and feasibility;
- `color-science`: sRGB/XYZ/Lab and CIEDE2000;
- `recommendation-engine`: compatibility, ranking, confidence, reasons;
- `validation`: schemas and domain diagnostics;
- `storage`: IndexedDB transactions and migration;
- `import-export`: portable snapshots and integrity checks;
- `ui`: presentation only.

Business calculations shall not be duplicated in UI handlers. Seed records shall never be modified at runtime.

## 22. Security and privacy baseline

- Uploaded images shall remain local unless a future feature obtains explicit consent for transmission.
- Imported JSON shall be treated as untrusted input.
- No arbitrary expressions, HTML, scripts, or file paths from imported data shall be executed.
- Notes and display names shall be rendered as text, not unsanitized HTML.
- Attachment types and sizes shall be validated.

## 23. Automated pressure-test matrix

All tests in the applicable release gate are mandatory. Numeric comparisons use canonical decimal equality unless a color-science tolerance is explicitly stated.

### 23.1 Source conversion tests

1. `0.08 / 35.2 × 100` returns `0.227272727272…%`.
2. `0.20 / 35.2 × 100` returns `0.568181818181…%`.
3. `0.07 / 35.2 × 100` returns `0.198863636363…%`.
4. `0.10 / 35.2 × 100` returns `0.284090909090…%`.
5. 152°F converts to 66.666…°C and 194°F converts to 90°C.
6. Seed process guidance preserves 152°F, 194°F, 60 seconds, and 120 seconds as exact decimal strings.
7. Operator-facing temperature conversion rounds 152°F to 66.7°C and 194°F to 90°C.
8. Calculator and production-plan guidance both retain the `unverified_transcription` state.

### 23.2 Fixed-formula tests

1. Raspberry at Regular with 100 g and 0.50% returns 0.500 g total and 0.350/0.125/0.025 g components.
2. Raspberry at Regular with 250 g returns 1.2500 g total and 0.8750/0.3125/0.0625 g components.
3. At 100 g, Regular/Medium/Light return exactly 0.500/0.450/0.400 g total pure dye while preserving component ratios.
4. Scaling 100 → 250 → 100 uses ratios and canonical inputs, returning the original result.
5. Coral, Lime, Olive midpoint, Turquoise midpoint, and Gray coal midpoint match Section 8 and the original worked values.
6. Ratios totaling 0.999 or 1.001 fail; no silent normalization occurs.
7. A negative ratio, ratio over 1, duplicate dye, or missing dye reference fails.
8. Zero dye load returns zero component masses and `not_applicable` scale percentages without division by zero.
9. Inputs containing `NaN`, infinity, exponent notation, commas, or embedded units fail.
10. Repeating the same calculation 1,000 times produces identical canonical result JSON.

### 23.3 Range-template tests

1. Turquoise Green 0.80 derives Blue 0.15 and total 1.
2. Turquoise Green 0.85 derives Blue 0.10 and total 1.
3. Turquoise midpoint derives 0.825/0.125/0.05.
4. Turquoise Green below 0.80 or above 0.85 fails.
5. Olive and Gray coal endpoints and midpoints derive valid totals.
6. An unknown constraint kind fails without expression evaluation.
7. A resolved recipe snapshot contains fixed ratios only.

### 23.4 Direct-dye tests

1. Every dose-plan component has method `direct`.
2. Every component’s target weighing equals its target pure-dye mass exactly.
3. Raspberry at 100 g and the Regular 0.50% pillar preset produces direct targets of 0.350/0.125/0.025 g.
4. No dosing-method or concentration field is accepted as production intent.
5. Base wax is weighed directly and receives no carrier correction.

### 23.5 Scale tests

1. Target 0.015 g/readability 0.01 g returns 66.666…% relative increment, 0.020 g displayable target, and 33.333…% planned deviation.
2. Target 0.015 g/readability 0.001 g returns 6.666…% relative increment, 0.015 g displayable target, and 0% planned deviation.
3. Target 0.0145 g/readability 0.001 g resolves to 0.015 g using round-half-up.
4. Missing accuracy or repeatability returns unknown effective uncertainty plus `SCALE_CAPABILITY_UNVERIFIED`.
5. With readability 0.001 g, repeatability 0.002 g, and accuracy 0.0015 g, effective uncertainty is 0.002 g.
6. A gross dose above capacity or below configured minimum load fails for that scale.
7. Zero or negative readability/capacity fails.
8. Feasibility equals the worst available classification, with deterministic boundary behavior at 2%, 5%, and 10%.

### 23.5.1 Fragrance-volume tests

1. Unit conversion uses exactly 453.59237 g/lb and 29.5735295625 mL/US fl oz.
2. A 100.000 g wax basis with no Vybar and 1 US fl oz/lb returns 0.220462262… US fl oz and 6.519847228… mL.
3. A 100.000 g wax target plus 0.500 g Vybar at 1 US fl oz/lb returns a 100.500 g basis, 0.221564573… US fl oz, and 6.552446464… mL.
4. Changing Vybar changes the fragrance basis; changing dye mass does not.
5. Missing, zero, negative, exponent-form, or unit-suffixed ratio input fails visibly.
6. The production plan labels the ratio US fl oz/lb and displays mL plus US fl oz as volume targets.
7. When fragrance is enabled, fragrance mass and exact finished-formulation mass are `null` rather than estimated.

### 23.6 Actual batch and traceability tests

1. The Section 17.5 batch recomputes 100.001 g actual base wax, 0.301 g actual pure dye, 0.300997…% actual dye load, and 100.803 g finished formulation.
2. A batch is rejected if any resolved recipe component is absent or duplicated.
3. Every actual direct-dye mass is also its actual pure-dye mass.
4. Every material and dye measurement retains an immutable version and lot reference where required.
5. Changing a recipe or formulation creates a new version and leaves prior batch reconstruction unchanged.
6. A zero actual base-wax mass cannot complete.
7. Target values remain unchanged when actuals are entered.
8. Warning acknowledgements remain in history after the underlying setting changes.

### 23.7 Color and confidence tests

1. CIEDE2000 identity returns zero and is symmetric within `1e-12`.
2. Required Sharma reference pairs pass within `1e-4`.
3. Incompatible illuminant, observer, geometry, backing, or sample protocol is excluded or rejected as specified.
4. Stable tie ordering follows all six ranking keys.
5. Fewer than three independent batches cannot yield `exact_verified_recipe`.
6. Multiple readings of one sample count as one batch.
7. An uncontrolled photo caps confidence at `experimental`.
8. Screen sRGB/HEX caps confidence at `medium`.
9. No compatible evidence returns `insufficient_data` or a manufacturer template labeled `experimental`.
10. Every result contains at least one reason code when confidence is below `exact_verified_recipe`.
11. Every predefined screen anchor maps back to its own template using sRGB → Lab → CIEDE2000.
12. Chromatic and achromatic targets compare only with anchors on the same side of the Lab-chroma threshold.
13. The vivid blue regression target `#547AFF` cannot select Gray coal.
14. A sweep of vivid colors around the full hue circle at representative brightness levels never selects Gray coal.
15. The pale-mint regression target `#E7FFFA` selects Turquoise rather than Gray coal.
16. A sweep of visible pale tints around the hue circle never selects Gray coal.
17. Every visual anchor returns its resolved seed midpoint ratios exactly.
18. Moving hue within Raspberry changes Red and Blue in opposite directions while preserving White when saturation and value are unchanged.
19. Decreasing saturation in a `two_color_plus_tint` family increases its tint component within declared bounds.
20. Changing value in Gray coal changes White and Black in opposite directions within declared bounds.
21. Every visual adjustment contains only dyes declared by its family, every ratio remains in `[0, 1]`, and the exact decimal ratio sum is `1`.
22. Visual-target selection never mutates a template’s stored seed ratios.
23. A visual-target calculation includes `SCREEN_TARGET_EXPERIMENTAL` and leaves the operator-selected dye load unchanged.
24. The bundled CSS named-color table contains 139 unique opaque sRGB reference values after alias consolidation.
25. Every exact CSS reference HEX resolves to itself with ΔE00 zero.
26. `#E7FFFA` resolves to the nearest CSS name Light Cyan while retaining its exact selected HEX.
27. The screen-color name and wax-family name are rendered as distinct fields in the wheel and production plan.

### 23.8 Persistence tests

1. Export contains all transitive references and a correct entity-count manifest.
2. Export followed by import preserves canonical data and attachment checksums.
3. Older supported schema migrates in memory without changing the source file.
4. Any validation, migration, quota, or transaction failure leaves existing data unchanged.
5. Same immutable ID/version with different content is a hard merge conflict.
6. Unknown future schema versions fail visibly.
7. Storage unavailable and quota exceeded states are visible and recoverable.

## 24. Release acceptance gates

### 24.1 Release 1.0 gate

- [ ] All 16 dyes and six formula templates exist in immutable seed data.
- [ ] Source evidence is recorded and visibly marked verified or unverified.
- [ ] The UI identifies Freedom Pillar Wax and American Soy Organics separately and exposes only Regular 0.50%, Medium 0.45%, and Light 0.40% pillar color-strength presets.
- [ ] Manufacturer dye-temperature and mixing guidance appears beside the calculator and in the printable production plan without being presented as a universal wax melting point.
- [ ] Fixed and constrained formulas resolve deterministically.
- [ ] Decimal mass arithmetic follows Section 6.5.
- [ ] Every dye component is calculated and displayed as direct dye only.
- [ ] Mathematical target, displayable target, and finished formulation mass are distinct.
- [ ] Fragrance volume uses the entered US fl oz/lb ratio and wax + Vybar basis, while fragrance mass and exact finished mass remain unavailable without density.
- [ ] Scale readability, capacity, minimum load, accuracy, and repeatability behavior follows Section 10.
- [ ] Diagnostics contain code, severity, field path, and message.
- [ ] No screen or photo input is represented as a calibrated physical-color formula.
- [ ] Visual-target mode selects only a predefined family, uses only its bounded declared adjustment model, and clearly displays its experimental limitation.
- [ ] Sections 23.1–23.5 pass in automated tests.
- [ ] Section 23.7 items 1–2 and 11–27 pass in automated tests.
- [ ] The production weighing plan is usable at phone viewport sizes and printable without losing values or warnings.

### 24.2 Release 1.1 gate

- [ ] Recipe, formulation, material, and scale versions are immutable after use.
- [ ] Batch target and actual records satisfy Section 17.5.
- [ ] Actual mass balance is recomputed, never trusted from imported derived fields.
- [ ] IndexedDB writes are transactional.
- [ ] Backup freshness, unavailable storage, and quota errors are visible.
- [ ] Import validates before an atomic commit and supports explicit replace/merge modes.
- [ ] Formal JSON Schemas cover every persisted entity and enforce the unions and reference shapes in this specification.
- [ ] Sections 23.6 and 23.8 pass.

### 24.3 Release 1.2 gate

- [ ] A sample protocol has been physically approved.
- [ ] Blank and calibration observations use versioned formulation and sample protocols.
- [ ] Raw readings and aggregates are stored.
- [ ] CIEDE2000 reference tests pass.
- [ ] Compatibility filtering occurs before ranking.
- [ ] Confidence and reason codes follow Section 15.
- [ ] No operational ΔE00 pass threshold is assumed before explicit approval.
- [ ] Section 23.7 passes.

### 24.4 Release 1.3 gate

- [ ] Photo capture declares controlled, calibrated, or uncontrolled status.
- [ ] Reference-card and correction versions are stored where applicable.
- [ ] Uncontrolled photos cannot exceed `experimental` confidence.
- [ ] Original image, corrected image or correction parameters, and sampled region remain traceable.

## 25. Required shop configuration before production approval

These inputs do not block coding Release 1.0, but recipes shall remain `testing` until applicable values are supplied:

- typical base-wax batch mass in grams;
- scale model, readability, capacity, minimum load, accuracy, and repeatability checks;
- exact Vybar load and basis;
- fragrance identity and bottle ratio interpreted in US fl oz/lb;
- standard melt, addition, mix, pour, and cooling process;
- standard cure evaluation interval;
- approved sample geometry and backing;
- initial observation hardware;
- Pinewood Blooms operational definition of an acceptable match.

Null placeholders shall never silently become production defaults.

## 26. Decision log

- **D-001:** Grams are the canonical production unit.
- **D-002:** Base-wax target excludes dye, additive, and fragrance.
- **D-003:** Production decimals are strings calculated in a declared decimal context.
- **D-004:** Manufacturer templates are distinct from production recipes.
- **D-005:** Recipe and formulation versions are immutable after use.
- **D-006:** All supported dye components are measured as direct dye; concentrate dosing is outside product scope.
- **D-007:** Reserved; the former carrier-wax decision was retired by D-006.
- **D-008:** Relative scale increment is not called measurement error.
- **D-009:** Sample geometry and measurement context are part of color comparability.
- **D-010:** Source, verification, confidence, and measurement quality are separate dimensions.
- **D-011:** Version 1.0 is the calculator; persistence and color lookup have independent release gates.
- **D-012:** No novel physical-color formula generation occurs in Releases 1.x.
- **D-013:** JSON is canonical interchange; IndexedDB is runtime storage beginning in Release 1.1.
- **D-014:** Acknowledged warnings remain visible in production history.
- **D-015:** Release 1 visual targets may derive a bounded screen-space ratio variation inside the nearest predefined family, but may not introduce dyes, mutate seed ratios, change total dye load, or claim a calibrated physical-color match.
- **D-016:** Selected screen colors use the nearest W3C CSS named sRGB color as a readable reference; this name remains separate from the wax-family match and exact selected HEX.
- **D-017:** Release 1 repeats the transcribed manufacturer dye-temperature and mixing instructions in the calculator and production plan, preserving the unverified-source label and separating dye-dissolving guidance from wax-specific melting requirements.
- **D-018:** At the operator’s direction, the fragrance bottle’s `1 oz/lb` instruction is interpreted as `1 US fl oz/lb`. Release 1 calculates mL from base wax + Vybar using exact US unit conversions, requests no density, and does not claim fragrance mass or exact finished-formulation mass.
- **D-019:** Release 1 constrains pillar color strength to Regular 0.50%, Medium 0.45%, and Light 0.40%, defaulting to Regular. The percentages are relative dye-dose levels, not claims of linear visual intensity, and remain subject to physical color and burn testing.

## 27. Glossary

- **Base wax:** Primary wax used as the formula mass basis.
- **Batch:** One actual, independently produced attempt.
- **Displayable target:** Nearest deterministic mass represented at the scale’s readability.
- **Dye load:** Pure dye as a percentage of base-wax mass.
- **Formula template:** Source ratios not yet bound to a production formulation or verified target.
- **Formulation profile:** Versioned wax, additive, fragrance, dye-system, process, and sample context.
- **Independent batch:** Separately weighed, melted, mixed, poured, and cured attempt.
- **Planned deviation:** Difference between mathematical and displayable targets.
- **Readability:** Smallest increment displayed by a scale.
- **Recipe version:** Immutable production intent with resolved ratios and a formulation-profile reference.
- **Relative increment:** One scale display increment as a percentage of target mass.
- **Sample protocol:** Versioned physical geometry, cure, backing, and measurement procedure.
- **Target color:** Versioned visual or measured reference the operator wants to reproduce.

---

# End of Specification v0.2.0
