import {
  APPLICATION_PRESETS,
  DYES,
  DYE_BY_ID,
  FORMULA_TEMPLATES,
  TEMPLATE_BY_ID,
} from "./data/seed.js";
import { calculateWeighingPlan, DomainError } from "./domain/calculator.js";
import {
  findNearestScreenTemplate,
  hexToRgb,
  hsvToRgb,
  normalizeHex,
  rgbToHex,
  rgbToHsv,
} from "./domain/color-science.js";
import { ExactDecimal } from "./domain/decimal.js";
import { midpointPercent, resolveTemplate } from "./domain/formula-engine.js";
import { resolveDyeProcessGuidance } from "./domain/process-guidance.js";
import { findNearestCssNamedColor } from "./domain/screen-color-name.js";
import { deriveVisualFormula } from "./domain/visual-formula.js";

const form = document.querySelector("#calculator-form");
const templateSelect = document.querySelector("#template-select");
const rangeEditor = document.querySelector("#range-editor");
const fixedFormula = document.querySelector("#fixed-formula");
const customEditor = document.querySelector("#custom-editor");
const customRows = document.querySelector("#custom-rows");
const formError = document.querySelector("#form-error");
const emptyState = document.querySelector("#empty-state");
const resultsRoot = document.querySelector("#results");
const colorWheelPanel = document.querySelector("#color-wheel-panel");
const colorWheel = document.querySelector("#color-wheel");
const wheelMarker = document.querySelector("#wheel-marker");
const nativeColor = document.querySelector("#native-color");
const targetHex = document.querySelector("#target-hex");
const brightness = document.querySelector("#brightness");
const modeFormula = document.querySelector("#mode-formula");
const modeWheel = document.querySelector("#mode-wheel");
const dyeStrengthSelect = document.querySelector("#dye-strength");

let customComponents = [
  { dyeId: "candle-shop-red", percent: "70" },
  { dyeId: "candle-shop-blue", percent: "25" },
  { dyeId: "candle-shop-white", percent: "5" },
];
let targetMode = "formula";
let selectedTargetHex = "#b63d69";
let wheelState = rgbToHsv(hexToRgb(selectedTargetHex));
let visualComponents = null;
let selectedScreenName = findNearestCssNamedColor(selectedTargetHex);
const dyeProcessGuidance = resolveDyeProcessGuidance();
const dyeStrengthById = new Map(APPLICATION_PRESETS.dyeStrengths.map((strength) => [strength.id, strength]));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dyeOptions(selected) {
  return DYES.map((dye) => (
    `<option value="${dye.id}"${dye.id === selected ? " selected" : ""}>${escapeHtml(dye.displayName)}</option>`
  )).join("");
}

function processGuidanceMarkup() {
  const verificationLabel = dyeProcessGuidance.sourceVerified
    ? "Source verified"
    : "Transcription unverified";
  const verificationNote = dyeProcessGuidance.sourceVerified
    ? "The manufacturer source has been verified."
    : "The transcription still needs a second-person check against the manufacturer source.";
  return `
    <div class="guidance-heading">
      <div><p class="step-label">Manufacturer process guidance</p><h3>Dye temperature & mixing</h3></div>
      <span class="guidance-badge">${verificationLabel}</span>
    </div>
    <div class="guidance-grid">
      <article>
        <span>01 · Prepare wax</span>
        <strong>Fully melted</strong>
        <small>Add the dye only after the wax is completely melted.</small>
      </article>
      <article>
        <span>02 · Dissolve dye</span>
        <strong>At least about ${dyeProcessGuidance.minimumDyeDissolveTemperatureF}°F / ${dyeProcessGuidance.minimumDyeDissolveTemperatureC}°C</strong>
        <small>This is the transcribed minimum temperature for dissolving the dye—not a universal wax melting point.</small>
      </article>
      <article>
        <span>03 · Upper limit</span>
        <strong>No higher than about ${dyeProcessGuidance.maximumRecommendedDyeTemperatureF}°F / ${dyeProcessGuidance.maximumRecommendedDyeTemperatureC}°C</strong>
        <small>Also follow the wax manufacturer and equipment safety limits.</small>
      </article>
      <article>
        <span>04 · Mix</span>
        <strong>${dyeProcessGuidance.minimumMixMinutes}–${dyeProcessGuidance.maximumMixMinutes} minutes</strong>
        <small>Mix the molten wax and dye until the dye is completely dissolved.</small>
      </article>
    </div>
    <p class="guidance-note">These are dye-manufacturer instructions, not a confirmed Pinewood Blooms production process. ${verificationNote} Always follow the selected wax and equipment safety instructions.</p>
  `;
}

function initTemplates() {
  templateSelect.innerHTML = [
    ...FORMULA_TEMPLATES.map((template) => (
      `<option value="${template.id}">${escapeHtml(template.displayName)} · starter formula</option>`
    )),
    '<option value="custom">Custom formula</option>',
  ].join("");
}

function updateDyeStrength({ recalculate = true } = {}) {
  const strength = dyeStrengthById.get(dyeStrengthSelect.value);
  document.querySelector("#dye-load").value = strength.pureDyeLoadPct;
  document.querySelector("#dye-strength-detail").textContent = `${ExactDecimal.parse(strength.pureDyeLoadPct).toFixed(3)} g pure dye per 100 g base wax. Relative dye amount—not a linear prediction of cured color intensity.`;
  if (recalculate) recalculateVisibleResult();
}

function initDyeStrength() {
  dyeStrengthSelect.innerHTML = APPLICATION_PRESETS.dyeStrengths.map((strength) => (
    `<option value="${strength.id}">${escapeHtml(strength.displayName)} · ${strength.manufacturerDoseOzPer2_2Lb} oz per 2.2 lb</option>`
  )).join("");
  dyeStrengthSelect.value = APPLICATION_PRESETS.defaultDyeStrengthId;
  updateDyeStrength({ recalculate: false });
}

function drawColorWheel() {
  const context = colorWheel.getContext("2d");
  const width = colorWheel.width;
  const radius = width / 2;
  const image = context.createImageData(width, width);

  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x + 0.5 - radius;
      const dy = y + 0.5 - radius;
      const distance = Math.hypot(dx, dy);
      const offset = (y * width + x) * 4;
      if (distance > radius) {
        image.data[offset + 3] = 0;
        continue;
      }
      const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const rgb = hsvToRgb(hue, distance / radius, wheelState.v);
      image.data[offset] = Math.round(rgb.r);
      image.data[offset + 1] = Math.round(rgb.g);
      image.data[offset + 2] = Math.round(rgb.b);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const angle = wheelState.h * Math.PI / 180;
  wheelMarker.style.left = `${50 + Math.cos(angle) * wheelState.s * 50}%`;
  wheelMarker.style.top = `${50 + Math.sin(angle) * wheelState.s * 50}%`;
}

function recalculateVisibleResult() {
  if (resultsRoot.hidden) return;
  try {
    renderResults(calculateWeighingPlan(collectInput()), { scroll: false });
  } catch (error) {
    showError(error);
  }
}

function updateWheelSelection({ recalculate = true } = {}) {
  selectedTargetHex = rgbToHex(hsvToRgb(wheelState.h, wheelState.s, wheelState.v));
  nativeColor.value = selectedTargetHex;
  targetHex.value = selectedTargetHex;
  brightness.value = String(Math.round(wheelState.v * 100));
  document.querySelector("#brightness-value").textContent = `${brightness.value}%`;
  document.querySelector("#selected-hex-label").textContent = selectedTargetHex;
  document.querySelector("#selected-swatch").style.background = selectedTargetHex;
  drawColorWheel();

  const match = findNearestScreenTemplate(selectedTargetHex, FORMULA_TEMPLATES);
  selectedScreenName = findNearestCssNamedColor(selectedTargetHex);
  templateSelect.value = match.template.id;
  const baseline = resolveTemplate(match.template).map((component) => ({
    dyeId: component.dyeId,
    ratio: component.ratio.toSignificant(),
  }));
  visualComponents = deriveVisualFormula(match.template, selectedTargetHex, baseline);
  document.querySelector("#screen-color-name").innerHTML = `
    <span>${selectedScreenName.exact ? "Exact" : "Nearest"} CSS named screen color</span>
    <strong>${escapeHtml(selectedScreenName.name)}</strong>
    <small>W3C sRGB ${selectedScreenName.hex.toUpperCase()} · ΔE00 ${selectedScreenName.deltaE00.toFixed(2)}</small>
  `;
  document.querySelector("#screen-match").innerHTML = `
    <span>Nearest predefined color family</span>
    <strong>${escapeHtml(match.template.displayName)}</strong>
    <small>Nearest available anchor; ratios adjust within family · ΔE00 ${match.deltaE00.toFixed(2)} · experimental</small>
  `;
  renderFormula();
  if (recalculate) recalculateVisibleResult();
}

function setWheelFromHex(hex, { recalculate = true } = {}) {
  try {
    selectedTargetHex = normalizeHex(hex);
    wheelState = rgbToHsv(hexToRgb(selectedTargetHex));
    updateWheelSelection({ recalculate });
    formError.hidden = true;
  } catch {
    showError(new DomainError("INVALID_SCREEN_COLOR", "Enter a six-digit HEX color.", "visualTarget.hex"));
  }
}

function updateWheelFromPointer(event) {
  const bounds = colorWheel.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  const radius = bounds.width / 2;
  wheelState.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  wheelState.s = Math.min(1, Math.hypot(dx, dy) / radius);
  updateWheelSelection();
}

function initColorWheel() {
  let dragging = false;
  colorWheel.addEventListener("pointerdown", (event) => {
    dragging = true;
    colorWheel.setPointerCapture(event.pointerId);
    updateWheelFromPointer(event);
  });
  colorWheel.addEventListener("pointermove", (event) => {
    if (dragging) updateWheelFromPointer(event);
  });
  colorWheel.addEventListener("pointerup", (event) => {
    dragging = false;
    colorWheel.releasePointerCapture(event.pointerId);
  });
  nativeColor.addEventListener("input", () => setWheelFromHex(nativeColor.value));
  targetHex.addEventListener("input", () => {
    if (/^#?[0-9a-f]{6}$/i.test(targetHex.value.trim())) {
      setWheelFromHex(targetHex.value);
    }
  });
  targetHex.addEventListener("change", () => setWheelFromHex(targetHex.value));
  brightness.addEventListener("input", () => {
    wheelState.v = Number(brightness.value) / 100;
    updateWheelSelection();
  });
  updateWheelSelection({ recalculate: false });
}

function setTargetMode(mode, { recalculate = true } = {}) {
  targetMode = mode;
  const wheelActive = mode === "wheel";
  modeFormula.classList.toggle("active", !wheelActive);
  modeFormula.setAttribute("aria-pressed", String(!wheelActive));
  modeWheel.classList.toggle("active", wheelActive);
  modeWheel.setAttribute("aria-pressed", String(wheelActive));
  colorWheelPanel.hidden = !wheelActive;
  templateSelect.disabled = wheelActive;
  document.querySelector("#formula-label").textContent = wheelActive ? "Matched formula" : "Formula";
  document.querySelector("#formula-field small").textContent = wheelActive
    ? "A bounded ratio adjustment inside the nearest family; not a calibrated wax prediction."
    : "Manufacturer ratios are starting templates, not verified physical colors.";
  if (wheelActive) updateWheelSelection({ recalculate });
}

function currentComponents() {
  if (targetMode === "wheel" && visualComponents) return visualComponents;

  if (templateSelect.value === "custom") {
    return customComponents.map((component, index) => {
      let ratio;
      try {
        ratio = ExactDecimal.parse(component.percent, { allowNegative: false })
          .divide(ExactDecimal.ONE_HUNDRED)
          .toSignificant();
      } catch {
        throw new DomainError("INVALID_DECIMAL", "Enter a valid component percentage.", `components[${index}].ratio`);
      }
      return { dyeId: component.dyeId, ratio };
    });
  }

  const template = TEMPLATE_BY_ID.get(templateSelect.value);
  const variableInput = rangeEditor.querySelector("#range-value");
  const variableRatio = variableInput
    ? ExactDecimal.parse(variableInput.value, { allowNegative: false })
      .divide(ExactDecimal.ONE_HUNDRED)
      .toSignificant()
    : null;
  return resolveTemplate(template, variableRatio).map((component) => ({
    dyeId: component.dyeId,
    ratio: component.ratio.toSignificant(),
  }));
}

function renderFormula() {
  formError.hidden = true;
  const isCustom = templateSelect.value === "custom";
  customEditor.hidden = !isCustom;
  fixedFormula.hidden = isCustom;
  rangeEditor.hidden = true;
  rangeEditor.innerHTML = "";

  if (isCustom) {
    renderCustomRows();
    return;
  }

  if (targetMode === "wheel") {
    renderPreview();
    return;
  }

  const template = TEMPLATE_BY_ID.get(templateSelect.value);
  if (template.kind === "bounded_complement") {
    const midpoint = midpointPercent(template);
    const minimum = ExactDecimal.parse(template.variableMinRatio).multiply(100).toSignificant();
    const maximum = ExactDecimal.parse(template.variableMaxRatio).multiply(100).toSignificant();
    const variableName = DYE_BY_ID.get(template.variableDyeId).displayName;
    rangeEditor.hidden = false;
    rangeEditor.innerHTML = `
      <div class="range-copy">
        <span>Choose ${escapeHtml(variableName)}</span>
        <strong id="range-readout">${midpoint}%</strong>
      </div>
      <input type="range" id="range-slider" min="${minimum}" max="${maximum}" step="0.1" value="${midpoint}" aria-label="${escapeHtml(variableName)} percentage">
      <div class="range-foot">
        <span>${minimum}%</span>
        <label>Exact <span class="input-with-unit mini"><input id="range-value" value="${midpoint}" inputmode="decimal"><b>%</b></span></label>
        <span>${maximum}%</span>
      </div>
      <small id="midpoint-note">Using the application-selected midpoint.</small>
    `;
    const slider = rangeEditor.querySelector("#range-slider");
    const number = rangeEditor.querySelector("#range-value");
    const updateRange = (value, midpointActive = false) => {
      slider.value = value;
      number.value = value;
      rangeEditor.querySelector("#range-readout").textContent = `${value}%`;
      rangeEditor.querySelector("#midpoint-note").textContent = midpointActive
        ? "Using the application-selected midpoint."
        : "Using your selected point within the linked range.";
      renderPreview();
    };
    slider.addEventListener("input", () => updateRange(slider.value));
    number.addEventListener("input", () => updateRange(number.value));
    number.addEventListener("change", () => updateRange(number.value));
  }
  renderPreview();
}

function renderPreview() {
  try {
    const components = currentComponents();
    fixedFormula.innerHTML = components.map((component) => {
      const percentValue = ExactDecimal.parse(component.ratio).multiply(100).toSignificant();
      return `<span class="formula-chip"><i class="dye-dot dye-${component.dyeId.replace("candle-shop-", "")}"></i>${escapeHtml(DYE_BY_ID.get(component.dyeId).displayName)} <strong>${percentValue}%</strong></span>`;
    }).join("");
  } catch (error) {
    showError(error);
  }
}

function renderCustomRows() {
  customRows.innerHTML = customComponents.map((component, index) => `
    <div class="custom-row" data-index="${index}">
      <select aria-label="Dye ${index + 1}">${dyeOptions(component.dyeId)}</select>
      <span class="input-with-unit mini"><input value="${escapeHtml(component.percent)}" inputmode="decimal" aria-label="Ratio percent"><b>%</b></span>
      <button type="button" class="icon-button remove-component" aria-label="Remove component">×</button>
    </div>
  `).join("");
  updateCustomTotal();

  customRows.querySelectorAll(".custom-row").forEach((row) => {
    const index = Number(row.dataset.index);
    row.querySelector("select").addEventListener("change", (event) => {
      customComponents[index].dyeId = event.target.value;
    });
    row.querySelector("input").addEventListener("input", (event) => {
      customComponents[index].percent = event.target.value;
      updateCustomTotal();
    });
    row.querySelector("button").addEventListener("click", () => {
      customComponents.splice(index, 1);
      renderFormula();
    });
  });
}

function updateCustomTotal() {
  const totalNode = document.querySelector("#ratio-total");
  try {
    const total = customComponents.reduce(
      (sum, component) => sum.add(ExactDecimal.parse(component.percent, { allowNegative: false })),
      ExactDecimal.ZERO,
    );
    totalNode.textContent = `Total: ${total.toSignificant()}%`;
    totalNode.classList.toggle("invalid", !total.equals(ExactDecimal.ONE_HUNDRED));
  } catch {
    totalNode.textContent = "Total: check values";
    totalNode.classList.add("invalid");
  }
}

function collectScale(prefix, displayName) {
  const value = (suffix) => document.querySelector(`#${prefix}-${suffix}`).value.trim();
  return {
    id: `${prefix}-scale`,
    displayName,
    readabilityG: value("readability"),
    capacityG: value("capacity"),
    minimumLoadG: value("minimum") || null,
    verifiedRepeatabilityG: value("repeatability") || null,
    verifiedAccuracyG: value("accuracy") || null,
  };
}

function collectInput() {
  const components = currentComponents();

  return {
    baseWaxTargetG: document.querySelector("#base-wax").value.trim(),
    dyeLoadPct: document.querySelector("#dye-load").value.trim(),
    components,
    scales: {
      wax: collectScale("wax", "Wax scale"),
      dye: collectScale("dye", "Precision scale"),
    },
    additive: {
      enabled: document.querySelector("#additive-enabled").checked,
      name: "Vybar 103 / PB 165",
      loadPct: document.querySelector("#additive-load").value.trim(),
    },
    fragrance: {
      enabled: document.querySelector("#fragrance-enabled").checked,
      name: document.querySelector("#fragrance-name").value.trim(),
      ratioFlOzPerLb: document.querySelector("#fragrance-ratio").value.trim(),
    },
    visualTarget: targetMode === "wheel"
      ? {
          hex: selectedTargetHex,
          mapping: "constrained_family_adjustment",
          standardNameSystem: "css-color-4",
          standardName: selectedScreenName.name,
          standardKeyword: selectedScreenName.keyword,
          standardReferenceHex: selectedScreenName.hex,
          standardNameDeltaE00: selectedScreenName.deltaE00.toFixed(6),
        }
      : null,
  };
}

function formatMass(value) {
  const number = Number(value);
  const maximumFractionDigits = number !== 0 && Math.abs(number) < 0.001 ? 9 : 6;
  return `${number.toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits,
  })} g`;
}

function formatPercent(value) {
  if (value === null) return "—";
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function formatVolume(value) {
  const number = Number(value);
  const maximumFractionDigits = number !== 0 && Math.abs(number) < 0.001 ? 9 : 6;
  return `${number.toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits,
  })} mL`;
}

function formatFluidOunces(value) {
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 6,
  })} fl oz`;
}

function formatRatioPercent(ratio) {
  return ExactDecimal.parse(ratio).multiply(ExactDecimal.ONE_HUNDRED).toSignificant();
}

function statusLabel(status) {
  return status.replaceAll("_", " ");
}

function weighingRows(result) {
  const rows = [{
    material: result.baseWax.materialName,
    detail: "Base wax",
    scaleName: "Wax scale",
    scale: result.baseWax.scale,
  }];
  for (const dose of result.dosePlan) {
    rows.push({
      material: `${dose.dyeName} dye`,
      detail: `${formatRatioPercent(dose.ratio)}% of pure dye`,
      scaleName: "Precision scale",
      scale: dose.scale,
    });
  }
  if (result.additive) rows.push({ material: result.additive.name, detail: `${result.additive.loadPct}% of base wax`, scaleName: "Precision scale", scale: result.additive.scale });
  if (result.fragrance) rows.push({
    kind: "volume",
    material: result.fragrance.name,
    detail: `${result.fragrance.ratioFlOzPerLb} fl oz/lb of wax + Vybar`,
    targetMl: result.fragrance.targetMl,
    targetFlOz: result.fragrance.targetFlOz,
  });
  return rows;
}

function renderResults(result, { scroll = true } = {}) {
  const uniqueDiagnostics = [...new Map(result.diagnostics.map((item) => [`${item.code}:${item.message}`, item])).values()];
  const rows = weighingRows(result);
  const warnings = uniqueDiagnostics.filter((item) => item.severity === "warning");

  resultsRoot.innerHTML = `
    <div class="result-heading">
      <div>
        <p class="step-label">Production plan</p>
        <h2>${escapeHtml(templateSelect.options[templateSelect.selectedIndex].text.replace(" · starter formula", ""))}</h2>
        ${result.visualTarget ? `<div class="result-target"><i style="background:${escapeHtml(result.visualTarget.hex)}"></i><span>Visual target ${escapeHtml(result.visualTarget.standardName)} (${escapeHtml(result.visualTarget.hex.toUpperCase())}) · experimental family adjustment</span></div>` : ""}
      </div>
      <button class="small-button print-button" type="button">Print plan</button>
    </div>

    <div class="summary-grid">
      <article><span>Total base wax</span><strong>${formatMass(result.baseWax.targetTotalG)}</strong></article>
      <article><span>Pure dye · ${escapeHtml(dyeStrengthById.get(dyeStrengthSelect.value).displayName)}</span><strong>${formatMass(result.pureDyeTotalG)}</strong></article>
      <article class="accent"><span>${result.fragrance ? "Known mass + fragrance" : "Finished formulation"}</span><strong>${result.fragrance ? `${formatMass(result.knownFormulationMassBeforeFragranceG)} + ${formatVolume(result.fragrance.targetMl)}` : formatMass(result.finishedFormulationTargetG)}</strong></article>
    </div>

    <section class="process-guidance result-guidance" aria-label="Dye temperature and mixing guidance">
      ${processGuidanceMarkup()}
    </section>

    ${warnings.length ? `
      <div class="diagnostics">
        <div class="diagnostic-heading"><span aria-hidden="true">!</span><strong>${warnings.length} item${warnings.length === 1 ? "" : "s"} to review</strong></div>
        <ul>${warnings.map((item) => `<li><code>${item.code}</code><span>${escapeHtml(item.message)}</span></li>`).join("")}</ul>
      </div>
    ` : '<div class="all-clear">No calculation warnings.</div>'}

    <div class="plan-section">
      <div class="section-title">
        <div><p class="step-label">Production order</p><h3>Mathematical vs. measurable</h3></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Material</th><th>Mathematical</th><th>Production target</th><th>Method / feasibility</th></tr></thead>
          <tbody>
            ${rows.map((row, index) => `
              <tr>
                <td><span class="row-number">${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(row.material)}</strong><small>${escapeHtml(row.detail)}</small></div></td>
                ${row.kind === "volume" ? `
                  <td title="Canonical: ${row.targetMl} mL">${formatVolume(row.targetMl)}</td>
                  <td title="Canonical: ${row.targetMl} mL"><strong>${formatVolume(row.targetMl)}</strong><small>${formatFluidOunces(row.targetFlOz)}</small></td>
                  <td><span class="status status-not_applicable">measure volume</span><small>US fluid ounces</small></td>
                ` : `
                  <td title="Canonical: ${row.scale.targetG}">${formatMass(row.scale.targetG)}</td>
                  <td title="Canonical: ${row.scale.displayableTargetG}"><strong>${formatMass(row.scale.displayableTargetG)}</strong><small>${row.scale.plannedDeviationPct === null ? "Not applicable" : `${formatPercent(row.scale.plannedDeviationPct)} planned deviation`}</small></td>
                  <td><span class="status status-${row.scale.status}">${statusLabel(row.scale.status)}</span><small>${row.scale.relativeIncrementPct === null ? "" : `${formatPercent(row.scale.relativeIncrementPct)} increment`}</small></td>
                `}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="formula-breakdown">
      <p class="step-label">Pure dye breakdown</p>
      ${result.dosePlan.map((dose) => `
        <div class="breakdown-row">
          <span><i class="dye-dot dye-${dose.dyeId.replace("candle-shop-", "")}"></i>${escapeHtml(dose.dyeName)}</span>
          <span>${formatRatioPercent(dose.ratio)}%</span>
          <strong>${formatMass(dose.targetPureDyeG)}</strong>
        </div>
      `).join("")}
      <div class="mass-basis-note">
        <strong>Mass accounting</strong>
        <span>${formatMass(result.baseWax.targetTotalG)} base wax + ${formatMass(result.pureDyeTotalG)} pure dye${result.additive ? ` + ${formatMass(result.additive.targetG)} additive` : ""} = ${formatMass(result.knownFormulationMassBeforeFragranceG)}${result.fragrance ? " known mass before fragrance. The exact finished weight is unavailable because fragrance is specified only by volume." : " finished formulation."}</span>
      </div>
      ${result.fragrance ? `
        <div class="fragrance-result-note">
          <strong>Fragrance volume</strong>
          <span>${formatVolume(result.fragrance.targetMl)} (${formatFluidOunces(result.fragrance.targetFlOz)}) from a ${formatMass(result.fragrance.basisG)} wax + Vybar basis at ${result.fragrance.ratioFlOzPerLb} fl oz/lb. Use a suitably graduated liquid measuring tool.</span>
        </div>
      ` : ""}
    </div>
  `;
  resultsRoot.querySelector(".print-button").addEventListener("click", () => window.print());
  emptyState.hidden = true;
  resultsRoot.hidden = false;
  if (scroll) resultsRoot.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showError(error) {
  const message = error instanceof DomainError ? error.message : "Something in the formula could not be calculated.";
  formError.innerHTML = `<strong>${escapeHtml(error.code || "CALCULATION_ERROR")}</strong><span>${escapeHtml(message)}</span>`;
  formError.hidden = false;
}

function resetForm() {
  form.reset();
  customComponents = [
    { dyeId: "candle-shop-red", percent: "70" },
    { dyeId: "candle-shop-blue", percent: "25" },
    { dyeId: "candle-shop-white", percent: "5" },
  ];
  selectedTargetHex = "#b63d69";
  wheelState = rgbToHsv(hexToRgb(selectedTargetHex));
  document.querySelector("#base-wax").value = "100.000";
  dyeStrengthSelect.value = APPLICATION_PRESETS.defaultDyeStrengthId;
  updateDyeStrength({ recalculate: false });
  document.querySelector("#wax-readability").value = "0.1";
  document.querySelector("#wax-capacity").value = "5000";
  document.querySelector("#dye-readability").value = "0.001";
  document.querySelector("#dye-capacity").value = "50";
  document.querySelector("#additive-fields").hidden = true;
  document.querySelector("#fragrance-fields").hidden = true;
  formError.hidden = true;
  resultsRoot.hidden = true;
  emptyState.hidden = false;
  setTargetMode("formula", { recalculate: false });
  updateWheelSelection({ recalculate: false });
  renderFormula();
}

templateSelect.addEventListener("change", renderFormula);
modeFormula.addEventListener("click", () => setTargetMode("formula"));
modeWheel.addEventListener("click", () => setTargetMode("wheel"));
document.querySelector("#add-component").addEventListener("click", () => {
  customComponents.push({ dyeId: DYES[0].id, percent: "0" });
  renderFormula();
});
document.querySelector("#additive-enabled").addEventListener("change", (event) => {
  document.querySelector("#additive-fields").hidden = !event.target.checked;
});
document.querySelector("#fragrance-enabled").addEventListener("change", (event) => {
  document.querySelector("#fragrance-fields").hidden = !event.target.checked;
});
dyeStrengthSelect.addEventListener("change", () => updateDyeStrength());
document.querySelector("#reset-button").addEventListener("click", resetForm);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  formError.hidden = true;
  try {
    renderResults(calculateWeighingPlan(collectInput()));
  } catch (error) {
    showError(error);
    formError.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

initTemplates();
initDyeStrength();
document.querySelector("#process-guidance").innerHTML = processGuidanceMarkup();
initColorWheel();
renderFormula();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const appRoot = new URL("../", import.meta.url);
  window.addEventListener("load", () => navigator.serviceWorker.register(
    new URL("sw.js", appRoot).href,
    { scope: appRoot.pathname },
  ).catch(() => {}));
}
