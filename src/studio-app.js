import {
  APPLICATION_PRESETS,
  BASE_WAX,
  DYES,
  DYE_BY_ID,
  FORMULA_TEMPLATES,
  VYBAR,
  WAX_TYPES,
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
import { resolveTemplate } from "./domain/formula-engine.js";
import { resolveDyeProcessGuidance } from "./domain/process-guidance.js";
import { findNearestCssNamedColor } from "./domain/screen-color-name.js";
import { deriveVisualFormula } from "./domain/visual-formula.js";
import {
  defaultStrengthForWaxType,
  guidanceForWaxType,
  strengthForDyeLoad,
  waxTypeById,
} from "./domain/wax-guidance.js";
import {
  createId,
  deriveActualRecipe,
  recipeChanged,
  recipeFormulaSummary,
  starterColors,
} from "./domain/library.js";
import { calculateBatchCost, normalizePurchaseCost, UNIT_GROUPS } from "./domain/cost.js";
import {
  getAllRecords,
  getSetting,
  openDatabase,
  putRecord,
  saveBatchBundle,
  saveColorPhotos,
  saveMaterialAndPrice,
  setSetting,
} from "./storage/indexeddb.js";
import { preparePhoto } from "./media/photos.js";
import { downloadBackup, inspectBackupFile, restoreBackup } from "./backup.js";

const app = document.querySelector("#app");
const toastElement = document.querySelector("#app-toast");
const toast = window.bootstrap ? new window.bootstrap.Toast(toastElement, { delay: 3200 }) : null;
const processGuidance = resolveDyeProcessGuidance();
const LEGACY_WAX_ID = "aso-freedom-pillar-wax";

const DEFAULT_MATERIALS = Object.freeze([
  ...WAX_TYPES.map((waxType) => ({
    id: waxType.materialId,
    name: waxType.displayName,
    description: "Base wax for decorative molded pieces",
    category: "wax",
    unitGroup: "mass",
  })),
  {
    id: "dye-default",
    name: "Candle Shop dye · average",
    description: "Fallback price used for every dye without its own price",
    category: "dye",
    unitGroup: "mass",
  },
  {
    id: VYBAR.id,
    name: VYBAR.displayName,
    description: "Optional wax additive",
    category: "additive",
    unitGroup: "mass",
  },
  {
    id: "fragrance-default",
    name: "Fragrance oil · average",
    description: "Fallback volume price for fragrance oils",
    category: "fragrance",
    unitGroup: "volume",
  },
]);

const state = {
  starters: starterColors(),
  colors: [],
  recipes: [],
  batches: [],
  photos: [],
  materials: [],
  prices: [],
  hiddenStarterIds: [],
  pendingPhotos: [],
  draft: null,
  objectUrls: [],
  importInspection: null,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, tone = "default") {
  toastElement.classList.toggle("toast-danger", tone === "danger");
  toastElement.querySelector(".toast-body").textContent = message;
  toast?.show();
}

function releaseObjectUrls() {
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
  state.objectUrls = [];
}

function objectUrl(blob) {
  const url = URL.createObjectURL(blob);
  state.objectUrls.push(url);
  return url;
}

function formatMass(value) {
  const number = Number(value);
  const digits = number !== 0 && Math.abs(number) < 0.001 ? 9 : 3;
  return `${number.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: digits })} g`;
}

function formatVolume(value) {
  return `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} mL`;
}

function formatMoney(value) {
  return Number(value ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatPercent(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatDate(value, options = {}) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  }).format(new Date(value));
}

function percentFromRatio(ratio) {
  return ExactDecimal.parse(ratio).multiply(100).toSignificant(12);
}

function editableRecipeComponents(components) {
  let assignedPercent = ExactDecimal.ZERO;
  return components.map((component, index) => {
    const percent = index === components.length - 1
      ? ExactDecimal.ONE_HUNDRED.subtract(assignedPercent).toSignificant(12)
      : percentFromRatio(component.ratio);
    assignedPercent = assignedPercent.add(ExactDecimal.parse(percent));
    return { dyeId: component.dyeId, percent };
  });
}

function ratioFromPercent(percent) {
  return ExactDecimal.parse(String(percent).trim(), { allowNegative: false }).divide(100).toSignificant(24);
}

function slug(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "material";
}

function routeInfo() {
  const raw = location.hash.startsWith("#/") ? location.hash.slice(2) : "library";
  const [path = "library", query = ""] = raw.split("?");
  return {
    segments: path.split("/").filter(Boolean).map(decodeURIComponent),
    query: new URLSearchParams(query),
  };
}

function setActiveNavigation(section) {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const active = link.dataset.nav === section;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const collapseElement = document.querySelector("#primary-nav");
  if (collapseElement?.classList.contains("show") && window.bootstrap) {
    window.bootstrap.Collapse.getOrCreateInstance(collapseElement).hide();
  }
}

async function ensureDefaultMaterials() {
  const existing = new Map((await getAllRecords("materials")).map((material) => [material.id, material]));
  const legacyWax = existing.get(LEGACY_WAX_ID);
  const now = new Date().toISOString();
  for (const material of DEFAULT_MATERIALS) {
    const current = existing.get(material.id);
    if (!current) {
      await putRecord("materials", {
        schemaVersion: 1,
        ...material,
        currentPriceId: material.id === BASE_WAX.id ? legacyWax?.currentPriceId ?? null : null,
        createdUtc: now,
        modifiedUtc: now,
      });
    } else if (material.id === BASE_WAX.id && !current.currentPriceId && legacyWax?.currentPriceId) {
      await putRecord("materials", { ...current, currentPriceId: legacyWax.currentPriceId, modifiedUtc: now });
    }
  }
  if (legacyWax && !legacyWax.archived) {
    await putRecord("materials", { ...legacyWax, archived: true, modifiedUtc: now });
  }
}

async function refreshState() {
  const [colors, recipes, batches, photos, materials, prices, hiddenStarterIds] = await Promise.all([
    getAllRecords("colors"),
    getAllRecords("recipeVersions"),
    getAllRecords("batches"),
    getAllRecords("photos"),
    getAllRecords("materials"),
    getAllRecords("materialPrices"),
    getSetting("hiddenStarterIds", []),
  ]);
  Object.assign(state, { colors, recipes, batches, photos, materials, prices, hiddenStarterIds });
}

function visibleColors({ includeArchived = false } = {}) {
  const starters = state.starters.filter((color) => !state.hiddenStarterIds.includes(color.id));
  const personal = state.colors.filter((color) => includeArchived || !color.archived);
  return [...personal, ...starters];
}

function colorById(colorId) {
  return state.colors.find((color) => color.id === colorId)
    ?? state.starters.find((color) => color.id === colorId)
    ?? null;
}

function recipeForColor(color) {
  if (!color) return null;
  if (color.kind === "starter") return structuredClone(color.recipe);
  return state.recipes.find((recipe) => (
    recipe.colorId === color.id && recipe.version === color.currentRecipeVersion
  )) ?? null;
}

function latestPhotoForColor(colorId) {
  return state.photos
    .filter((photo) => photo.colorId === colorId)
    .sort((a, b) => b.createdUtc.localeCompare(a.createdUtc))[0] ?? null;
}

function latestRates() {
  const prices = new Map(state.prices.map((price) => [price.id, price]));
  return new Map(state.materials
    .map((material) => [material.id, prices.get(material.currentPriceId)])
    .filter(([, price]) => Boolean(price)));
}

function colorPreviewMarkup(color, photo, classes = "") {
  if (photo?.thumbnailBlob) {
    return `<div class="color-preview has-photo ${classes}"><img src="${objectUrl(photo.thumbnailBlob)}" alt="Saved ${escapeHtml(color.name)} wax color"></div>`;
  }
  return `<div class="color-preview ${classes}" style="--color:${escapeHtml(color.screenHex || "#d8d1c2")}"></div>`;
}

function statusLabel(value) {
  return {
    untested: "Starting point",
    testing: "In testing",
    verified: "Verified",
    deprecated: "Retired",
  }[value] ?? "Saved color";
}

function colorCardMarkup(color) {
  const recipe = recipeForColor(color);
  const photo = latestPhotoForColor(color.id);
  const batches = state.batches.filter((batch) => batch.colorId === color.id);
  const isStarter = color.kind === "starter";
  return `
    <div class="col-sm-6 col-xl-4 color-card-column" data-search="${escapeHtml(`${color.name} ${recipeFormulaSummary(recipe)}`.toLowerCase())}">
      <article class="library-card">
        <div class="position-relative">
          ${colorPreviewMarkup(color, photo)}
          <span class="status-pill">${isStarter ? "Starter formula" : statusLabel(color.status)}</span>
          <button class="card-menu-button" type="button" data-action="${isStarter ? "hide-starter" : "archive-color"}" data-id="${escapeHtml(color.id)}" title="${isStarter ? "Hide starter" : "Remove from library"}" aria-label="${isStarter ? "Hide" : "Remove"} ${escapeHtml(color.name)}">×</button>
        </div>
        <div class="library-card-body">
          <div class="d-flex align-items-start justify-content-between gap-3">
            <div class="min-w-0">
              <p class="card-kicker">${batches.length ? `${batches.length} batch${batches.length === 1 ? "" : "es"}` : "Ready for a first batch"}</p>
              <h3><a href="#/color/${encodeURIComponent(color.id)}">${escapeHtml(color.name)}</a></h3>
              <p class="formula-summary mb-0">${escapeHtml(recipeFormulaSummary(recipe))}</p>
            </div>
          </div>
          <div class="card-footer-row">
            <span>${formatPercent(recipe.dyeLoadPct)}% dye load</span>
            <a class="card-action" href="#/batch/new?color=${encodeURIComponent(color.id)}">Create batch →</a>
          </div>
        </div>
      </article>
    </div>`;
}

async function hideStarter(colorId) {
  if (!state.hiddenStarterIds.includes(colorId)) {
    state.hiddenStarterIds.push(colorId);
    await setSetting("hiddenStarterIds", state.hiddenStarterIds);
  }
  showToast("Starter color hidden. You can restore it anytime.");
  await renderLibrary();
}

async function archiveColor(colorId) {
  const color = state.colors.find((item) => item.id === colorId);
  if (!color) return;
  if (!confirm(`Remove ${color.name} from your library? Its batches and photos will be kept, and you can restore it below.`)) return;
  await putRecord("colors", { ...color, archived: true, modifiedUtc: new Date().toISOString() });
  await refreshState();
  showToast("Color removed from the library. You can restore it anytime.");
  await renderLibrary();
}

async function restoreColor(colorId) {
  const color = state.colors.find((item) => item.id === colorId);
  if (!color) return;
  await putRecord("colors", { ...color, archived: false, modifiedUtc: new Date().toISOString() });
  await refreshState();
  showToast(`${color.name} restored to your library.`);
  await renderLibrary();
}

async function renderLibrary() {
  releaseObjectUrls();
  setActiveNavigation("library");
  const personal = state.colors.filter((color) => !color.archived);
  const archived = state.colors.filter((color) => color.archived);
  const starters = state.starters.filter((color) => !state.hiddenStarterIds.includes(color.id));
  const totalSavedCost = state.batches.reduce(
    (sum, batch) => sum + Number(batch.costSnapshot?.total ?? 0),
    0,
  );
  app.innerHTML = `
    <section class="page-shell">
      <div class="container-xl">
        <div class="library-hero">
          <div class="row align-items-end g-4">
            <div class="col-lg-8">
              <p class="eyebrow">Your color workshop</p>
              <h1 class="page-title">Build a color library you can return to, batch after batch.</h1>
              <p class="page-intro">Capture every decorative wax color you make, keep its formula and photos together, and see what each pour costs before you begin.</p>
            </div>
            <div class="col-lg-4 text-lg-end"><a class="btn btn-light btn-lg hero-cta" href="#/batch/new">Create a new color <span aria-hidden="true">→</span></a></div>
          </div>
          <div class="hero-metrics row g-3">
            <div class="col-4"><strong>${personal.length}</strong><span>Saved colors</span></div>
            <div class="col-4"><strong>${state.batches.length}</strong><span>Recorded batches</span></div>
            <div class="col-4"><strong>${formatMoney(totalSavedCost)}</strong><span>Recorded cost</span></div>
          </div>
        </div>

        <div class="alert alert-light border mt-4 mb-0"><strong>Made for decorative molded wax.</strong> The formulas in this workspace are for display pieces placed on sticks—not products intended to be lit or burned.</div>

        <div class="library-toolbar mt-5">
          <div>
            <p class="eyebrow mb-1">${personal.length ? "Your collection" : "Make it yours"}</p>
            <h2 class="section-heading mb-0">${personal.length ? "Saved colors" : "Your saved colors will live here"}</h2>
          </div>
          <label class="library-search">
            <span class="visually-hidden">Search colors</span>
            <span aria-hidden="true">⌕</span>
            <input class="form-control" id="library-search" type="search" placeholder="Search colors or dyes">
          </label>
        </div>

        ${personal.length ? `<div class="row g-4 mt-1" id="personal-colors">${personal.map(colorCardMarkup).join("")}</div>` : `
          <div class="empty-library mt-4">
            <div><span class="empty-swatch"></span><span class="empty-swatch"></span><span class="empty-swatch"></span></div>
            <h3>Your first signature color starts with one batch.</h3>
            <p>Choose a starter below, or build a formula from scratch. We’ll keep the result, photos, and cost together.</p>
            <a class="btn btn-brand" href="#/batch/new">Create your first color</a>
          </div>`}

        <div class="d-flex align-items-end justify-content-between gap-3 mt-5 mb-3">
          <div><p class="eyebrow mb-1">Ready to explore</p><h2 class="section-heading mb-0">Starter colors</h2></div>
          ${state.hiddenStarterIds.length ? `<button class="btn btn-link link-brand p-0" id="restore-starters">Restore ${state.hiddenStarterIds.length} hidden</button>` : `<span class="text-secondary small">${starters.length} formulas</span>`}
        </div>
        <p class="section-copy">Starter ratios give you a practical place to begin. Save your finished result as a personal color once you have tested it in wax.</p>
        <div class="row g-4 mt-1" id="starter-colors">${starters.map(colorCardMarkup).join("")}</div>
        <p class="no-search-results text-center text-secondary mt-5" hidden>No colors match that search.</p>

        ${archived.length ? `<details class="quiet-panel archive-panel mt-5">
          <summary>Removed colors <span>${archived.length}</span></summary>
          <div class="archive-list">${archived.map((color) => `<div><span><strong>${escapeHtml(color.name)}</strong><small>${escapeHtml(recipeFormulaSummary(recipeForColor(color)))}</small></span><button class="btn btn-sm btn-outline-secondary" type="button" data-action="restore-color" data-id="${escapeHtml(color.id)}">Restore</button></div>`).join("")}</div>
        </details>` : ""}
      </div>
    </section>`;

  document.querySelector("#library-search").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll(".color-card-column").forEach((column) => {
      const matches = !query || column.dataset.search.includes(query);
      column.hidden = !matches;
      if (matches) visible += 1;
    });
    document.querySelector(".no-search-results").hidden = visible > 0;
  });
  document.querySelectorAll("[data-action='hide-starter']").forEach((button) => {
    button.addEventListener("click", () => hideStarter(button.dataset.id));
  });
  document.querySelectorAll("[data-action='archive-color']").forEach((button) => {
    button.addEventListener("click", () => archiveColor(button.dataset.id));
  });
  document.querySelectorAll("[data-action='restore-color']").forEach((button) => {
    button.addEventListener("click", () => restoreColor(button.dataset.id));
  });
  document.querySelector("#restore-starters")?.addEventListener("click", async () => {
    state.hiddenStarterIds = [];
    await setSetting("hiddenStarterIds", []);
    showToast("Starter colors restored.");
    await renderLibrary();
  });
}

async function renderColorDetail(colorId) {
  releaseObjectUrls();
  setActiveNavigation("library");
  const color = colorById(colorId);
  if (!color) return renderNotFound();
  const recipe = recipeForColor(color);
  const batches = state.batches
    .filter((batch) => batch.colorId === colorId)
    .sort((a, b) => b.createdUtc.localeCompare(a.createdUtc));
  const photos = state.photos
    .filter((photo) => photo.colorId === colorId)
    .sort((a, b) => b.createdUtc.localeCompare(a.createdUtc));
  const totalCost = batches.reduce((sum, batch) => sum + Number(batch.costSnapshot?.total ?? 0), 0);
  const cover = photos[0] ?? null;

  app.innerHTML = `
    <section class="page-shell detail-page">
      <div class="container-xl">
        <a class="back-link" href="#/library">← Color library</a>
        <div class="row g-4 g-xl-5 mt-1 align-items-stretch">
          <div class="col-lg-6">
            <div class="detail-visual">
              ${colorPreviewMarkup(color, cover, "detail-preview")}
              <span class="status-pill">${color.kind === "starter" ? "Starter formula" : statusLabel(color.status)}</span>
            </div>
          </div>
          <div class="col-lg-6 d-flex">
            <div class="detail-copy align-self-center">
              <p class="eyebrow">${color.kind === "starter" ? "A practical place to begin" : "Saved in your library"}</p>
              <h1 class="page-title">${escapeHtml(color.name)}</h1>
              <p class="page-intro">${escapeHtml(color.notes || (color.kind === "starter" ? "Use this manufacturer formula as a starting point, then save what you actually make." : "A repeatable color with its formula, batches, and visual history in one place."))}</p>
              <div class="detail-actions d-flex flex-wrap gap-2 mt-4">
                <a class="btn btn-brand btn-lg" href="#/batch/new?color=${encodeURIComponent(color.id)}">Create another batch</a>
                <a class="btn btn-outline-secondary btn-lg" href="#/batch/new?color=${encodeURIComponent(color.id)}&adjust=1">Adjust formula</a>
              </div>
              <div class="detail-stats row g-3 mt-4">
                <div class="col-4"><strong>${batches.length}</strong><span>Batches</span></div>
                <div class="col-4"><strong>${photos.length}</strong><span>Photos</span></div>
                <div class="col-4"><strong>${formatMoney(totalCost)}</strong><span>Total cost</span></div>
              </div>
            </div>
          </div>
        </div>

        <div class="row g-4 mt-4">
          <div class="col-lg-5">
            <section class="surface-card p-4 p-md-5 h-100">
              <p class="eyebrow">Current formula</p>
              <div class="d-flex align-items-end justify-content-between gap-3">
                <h2 class="section-heading mb-0">Version ${recipe.version}</h2>
                <span class="load-pill">${formatPercent(recipe.dyeLoadPct)}% dye load</span>
              </div>
              <p class="small text-secondary mt-2 mb-0">Built for ${escapeHtml(waxTypeById(recipe.waxTypeId)?.displayName ?? "Paraffin wax")}</p>
              <div class="formula-list mt-4">
                ${recipe.components.map((component) => `
                  <div><span><i class="dye-dot dye-${escapeHtml(component.dyeId.replace("candle-shop-", ""))}"></i>${escapeHtml(DYE_BY_ID.get(component.dyeId)?.displayName)}</span><strong>${percentFromRatio(component.ratio)}%</strong></div>
                `).join("")}
              </div>
              <p class="technical-note mt-4 mb-0">Ratios define each dye’s share of the total pure dye. The dye load remains separate so the same formula can scale to any wax batch.</p>
            </section>
          </div>
          <div class="col-lg-7">
            <section class="surface-card p-4 p-md-5 h-100">
              <div class="d-flex justify-content-between gap-3 align-items-end">
                <div><p class="eyebrow">Production history</p><h2 class="section-heading mb-0">Recorded batches</h2></div>
                <a class="link-brand" href="#/batch/new?color=${encodeURIComponent(color.id)}">New batch</a>
              </div>
              ${batches.length ? `<div class="batch-list mt-4">
                ${batches.map((batch) => `
                  <a href="#/batch/${encodeURIComponent(batch.id)}">
                    <span><strong>${formatDate(batch.producedUtc)}</strong><small>${formatMass(batch.actuals.baseWaxG)} wax · ${batch.photosCount || 0} photo${batch.photosCount === 1 ? "" : "s"}</small></span>
                    <span class="text-end"><strong>${formatMoney(batch.costSnapshot?.total)}</strong><small>${batch.costSnapshot?.complete ? "Complete cost" : "Partial cost"}</small></span>
                  </a>`).join("")}
              </div>` : `<div class="empty-inline mt-4"><strong>No batches recorded yet.</strong><span>When you make this color, save the actual amounts and a photo here.</span></div>`}
            </section>
          </div>
        </div>

        <section class="mt-5">
          <div class="d-flex flex-column flex-md-row align-items-md-end justify-content-between gap-3">
            <div><p class="eyebrow">Visual history</p><h2 class="section-heading mb-0">Photos of this color</h2></div>
            <div class="d-flex flex-wrap align-items-end gap-2">
              <label><span class="visually-hidden">Photo stage</span><select class="form-select" id="detail-photo-stage"><option value="fresh">Fresh pour</option><option value="cured" selected>Cured wax</option><option value="finished">Finished piece</option></select></label>
              <label class="btn btn-outline-secondary" for="detail-photos">Add photos</label>
              <input class="visually-hidden" id="detail-photos" type="file" accept="image/*" multiple>
            </div>
          </div>
          ${photos.length ? `<div class="photo-gallery mt-3">${photos.map((photo) => `
              <figure><img src="${objectUrl(photo.thumbnailBlob)}" alt="${escapeHtml(photo.stage)} photo of ${escapeHtml(color.name)}"><figcaption>${escapeHtml(photo.stageLabel || photo.stage)} · ${formatDate(photo.createdUtc)}</figcaption></figure>
            `).join("")}</div>` : `<div class="empty-inline mt-4"><strong>No photos yet.</strong><span>Add the wax in front of you so this color is easier to recognize next time.</span></div>`}
        </section>
      </div>
    </section>`;

  document.querySelector("#detail-photos").addEventListener("change", (event) => addColorPhotos(event, color));
}

async function addColorPhotos(event, color) {
  const files = [...event.target.files];
  if (!files.length) return;
  const stage = document.querySelector("#detail-photo-stage").value;
  const stageLabel = { fresh: "Fresh pour", cured: "Cured wax", finished: "Finished piece" }[stage];
  const label = event.target.previousElementSibling;
  label.classList.add("disabled");
  label.textContent = "Preparing photos…";
  try {
    const preparedPhotos = await Promise.all(files.map((file) => preparePhoto(file)));
    const photos = preparedPhotos.map((prepared) => ({
        ...prepared,
        colorId: color.id,
        batchId: null,
        stage,
        stageLabel,
        measurementQuality: "photo_uncontrolled",
        notes: null,
      }));
    const now = new Date().toISOString();
    const updatedColor = color.kind === "personal" && !color.coverPhotoId
      ? { ...color, coverPhotoId: photos[0].id, modifiedUtc: now }
      : null;
    await saveColorPhotos(updatedColor, photos);
    await setSetting("lastChangeUtc", now);
    await refreshState();
    showToast(`${files.length} photo${files.length === 1 ? "" : "s"} added to ${color.name}.`);
    await renderColorDetail(color.id);
  } catch (error) {
    showToast(error.message, "danger");
    label.classList.remove("disabled");
    label.textContent = "Add photos";
    event.target.value = "";
  }
}

function buildDraft(colorId, adjust = false) {
  const sourceColor = colorById(colorId) ?? state.starters[0];
  const recipe = structuredClone(recipeForColor(sourceColor));
  const screenHex = sourceColor.screenHex || "#b63d69";
  const waxTypeId = recipe.waxTypeId ?? APPLICATION_PRESETS.defaultWaxTypeId;
  return {
    key: `${colorId ?? "new"}:${adjust}`,
    sourceColorId: sourceColor.id,
    sourceColor,
    name: colorId ? sourceColor.name : `My ${sourceColor.name}`,
    screenHex,
    wheelState: rgbToHsv(hexToRgb(screenHex)),
    components: editableRecipeComponents(recipe.components),
    waxTypeId,
    dyeLoadPct: recipe.dyeLoadPct,
    baseWaxG: "100.000",
    additiveEnabled: Boolean(recipe.additive),
    additiveLoadPct: recipe.additive?.loadPct ?? "",
    fragranceEnabled: Boolean(recipe.fragrance),
    fragranceName: recipe.fragrance?.name ?? "",
    fragranceRatio: recipe.fragrance?.ratioFlOzPerLb ?? "1.00",
    adjust,
    result: null,
    input: null,
    plannedRecipe: null,
    visualTarget: null,
  };
}

function dyeOptions(selected) {
  return DYES.map((dye) => `<option value="${escapeHtml(dye.id)}"${dye.id === selected ? " selected" : ""}>${escapeHtml(dye.displayName)}</option>`).join("");
}

function waxTypeOptions(selected) {
  return WAX_TYPES.map((waxType) => (
    `<option value="${escapeHtml(waxType.id)}"${waxType.id === selected ? " selected" : ""}>${escapeHtml(waxType.displayName)}</option>`
  )).join("");
}

function dyeLoadOptions(selected, waxTypeId = APPLICATION_PRESETS.defaultWaxTypeId) {
  const selectedValue = String(selected);
  const guidance = guidanceForWaxType(waxTypeId);
  const matchingPreset = strengthForDyeLoad(waxTypeId, selectedValue);
  const optionValue = matchingPreset?.pureDyeLoadPct ?? selectedValue;
  const customOption = matchingPreset
    ? ""
    : `<option value="${escapeHtml(selectedValue)}" selected>Saved formula · ${formatPercent(selectedValue)}% actual load</option>`;
  return `${guidance.dyeStrengths.map((strength) => `
    <option value="${escapeHtml(strength.pureDyeLoadPct)}"${strength.pureDyeLoadPct === optionValue ? " selected" : ""}>${escapeHtml(strength.displayName)} · ${escapeHtml(strength.manufacturerDoseOzPer2_2Lb)} oz per 2.2 lb</option>
  `).join("")}${customOption}`;
}

function waxGuidanceMarkup(waxTypeId) {
  const waxType = waxTypeById(waxTypeId);
  const guidance = guidanceForWaxType(waxTypeId);
  const high = guidance.dyeStrengths.find((strength) => strength.id === guidance.defaultDyeStrengthId);
  return `<strong>Your kit recommends ${escapeHtml(guidance.minimumDoseOz)}–${escapeHtml(guidance.maximumDoseOz)} oz of dye by weight for 2.2 lb of ${escapeHtml(waxType.displayName.toLowerCase())}.</strong> High uses ${escapeHtml(high.manufacturerDoseOzPer2_2Lb)} oz; for 100 g of wax, that is about ${formatPercent(high.pureDyeLoadPct)} g of total dye. Midpoint is calculated between the printed endpoints.`;
}

function applyWaxType(waxTypeId) {
  const defaultStrength = defaultStrengthForWaxType(waxTypeId);
  state.draft.waxTypeId = waxTypeId;
  state.draft.dyeLoadPct = defaultStrength.pureDyeLoadPct;
  state.draft.result = null;
  state.draft.input = null;
  state.draft.plannedRecipe = null;
  document.querySelector("#dye-load").innerHTML = dyeLoadOptions(state.draft.dyeLoadPct, waxTypeId);
  document.querySelector("#wax-guidance").innerHTML = waxGuidanceMarkup(waxTypeId);
  document.querySelector("#batch-result").innerHTML = "";
}

function renderDyeRows() {
  const container = document.querySelector("#dye-component-rows");
  if (!container) return;
  container.innerHTML = state.draft.components.map((component, index) => `
    <div class="formula-editor-row" data-index="${index}">
      <span class="row-step">${String(index + 1).padStart(2, "0")}</span>
      <select class="form-select component-dye" aria-label="Dye ${index + 1}">${dyeOptions(component.dyeId)}</select>
      <div class="input-group"><input class="form-control component-percent" value="${escapeHtml(component.percent)}" inputmode="decimal" aria-label="Dye percentage"><span class="input-group-text">%</span></div>
      <button class="btn btn-icon remove-component" type="button" aria-label="Remove dye">×</button>
    </div>`).join("");
  updateRatioTotal();
  container.querySelectorAll(".formula-editor-row").forEach((row) => {
    const index = Number(row.dataset.index);
    row.querySelector(".component-dye").addEventListener("change", (event) => {
      state.draft.components[index].dyeId = event.target.value;
    });
    row.querySelector(".component-percent").addEventListener("input", (event) => {
      state.draft.components[index].percent = event.target.value;
      updateRatioTotal();
    });
    row.querySelector(".remove-component").addEventListener("click", () => {
      if (state.draft.components.length === 1) {
        showToast("A formula needs at least one dye.", "danger");
        return;
      }
      state.draft.components.splice(index, 1);
      renderDyeRows();
    });
  });
}

function updateRatioTotal() {
  const node = document.querySelector("#ratio-total");
  if (!node) return;
  try {
    const total = state.draft.components.reduce(
      (sum, component) => sum.add(ExactDecimal.parse(component.percent, { allowNegative: false })),
      ExactDecimal.ZERO,
    );
    const valid = total.equals(ExactDecimal.ONE_HUNDRED);
    node.textContent = `Total ${total.toSignificant()}%`;
    node.classList.toggle("ratio-valid", valid);
    node.classList.toggle("ratio-invalid", !valid);
  } catch {
    node.textContent = "Check percentage values";
    node.classList.add("ratio-invalid");
    node.classList.remove("ratio-valid");
  }
}

function applySourceColor(colorId) {
  const sourceColor = colorById(colorId);
  const recipe = recipeForColor(sourceColor);
  state.draft.sourceColorId = sourceColor.id;
  state.draft.sourceColor = sourceColor;
  state.draft.screenHex = sourceColor.screenHex || "#b63d69";
  state.draft.wheelState = rgbToHsv(hexToRgb(state.draft.screenHex));
  state.draft.visualTarget = null;
  state.draft.components = editableRecipeComponents(recipe.components);
  state.draft.waxTypeId = recipe.waxTypeId ?? APPLICATION_PRESETS.defaultWaxTypeId;
  state.draft.dyeLoadPct = recipe.dyeLoadPct;
  document.querySelector("#color-name").value = state.draft.adjust ? sourceColor.name : `My ${sourceColor.name}`;
  document.querySelector("#wax-type").value = state.draft.waxTypeId;
  document.querySelector("#dye-load").innerHTML = dyeLoadOptions(recipe.dyeLoadPct, state.draft.waxTypeId);
  document.querySelector("#wax-guidance").innerHTML = waxGuidanceMarkup(state.draft.waxTypeId);
  document.querySelector("#screen-color").value = sourceColor.screenHex || "#b63d69";
  document.querySelector("#screen-hex").value = sourceColor.screenHex || "#b63d69";
  updateColorWheelUi({ redraw: true });
  renderDyeRows();
}

function drawColorWheel() {
  const canvas = document.querySelector("#color-wheel");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const radius = width / 2;
  const image = context.createImageData(width, width);
  const value = state.draft.wheelState.v;
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
      const rgb = hsvToRgb(hue, distance / radius, value);
      image.data[offset] = Math.round(rgb.r);
      image.data[offset + 1] = Math.round(rgb.g);
      image.data[offset + 2] = Math.round(rgb.b);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

function updateColorWheelUi({ redraw = false } = {}) {
  const wheel = state.draft.wheelState;
  const selectedHex = rgbToHex(hsvToRgb(wheel.h, wheel.s, wheel.v));
  state.draft.screenHex = selectedHex;
  const angle = wheel.h * Math.PI / 180;
  const marker = document.querySelector("#wheel-marker");
  if (marker) {
    marker.style.left = `${50 + Math.cos(angle) * wheel.s * 50}%`;
    marker.style.top = `${50 + Math.sin(angle) * wheel.s * 50}%`;
  }
  const nativeColor = document.querySelector("#screen-color");
  const canvas = document.querySelector("#color-wheel");
  const hexInput = document.querySelector("#screen-hex");
  const brightness = document.querySelector("#wheel-brightness");
  if (nativeColor) nativeColor.value = selectedHex;
  if (canvas) canvas.setAttribute("aria-valuetext", selectedHex.toUpperCase());
  if (hexInput) hexInput.value = selectedHex;
  if (brightness) brightness.value = String(Math.round(wheel.v * 100));
  const valueLabel = document.querySelector("#brightness-value");
  if (valueLabel) valueLabel.textContent = `${Math.round(wheel.v * 100)}%`;
  const swatch = document.querySelector("#wheel-selected-swatch");
  if (swatch) swatch.style.background = selectedHex;
  const hexLabel = document.querySelector("#wheel-selected-hex");
  if (hexLabel) hexLabel.textContent = selectedHex.toUpperCase();
  if (redraw) drawColorWheel();
}

function setColorWheelFromHex(value, { redraw = true } = {}) {
  const normalized = normalizeHex(value);
  state.draft.screenHex = normalized;
  state.draft.wheelState = rgbToHsv(hexToRgb(normalized));
  updateColorWheelUi({ redraw });
}

function updateColorWheelFromPointer(event) {
  const canvas = document.querySelector("#color-wheel");
  const bounds = canvas.getBoundingClientRect();
  const dx = event.clientX - (bounds.left + bounds.width / 2);
  const dy = event.clientY - (bounds.top + bounds.height / 2);
  const radius = bounds.width / 2;
  state.draft.wheelState.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  state.draft.wheelState.s = Math.min(1, Math.hypot(dx, dy) / radius);
  updateColorWheelUi();
}

function applyColorWheelToFormula() {
  try {
    const hex = normalizeHex(state.draft.screenHex);
    const match = findNearestScreenTemplate(hex, FORMULA_TEMPLATES);
    const baseline = resolveTemplate(match.template).map((component) => ({
      dyeId: component.dyeId,
      ratio: component.ratio.toSignificant(),
    }));
    const components = deriveVisualFormula(match.template, hex, baseline);
    const named = findNearestCssNamedColor(hex);
    state.draft.visualTarget = {
      hex,
      mapping: "constrained_family_adjustment",
      matchedTemplateId: match.template.id,
      standardNameSystem: "css-color-4",
      standardName: named.name,
      standardKeyword: named.keyword,
      standardReferenceHex: named.hex,
      standardNameDeltaE00: named.deltaE00.toFixed(6),
    };
    state.draft.components = components.map((component) => ({
      dyeId: component.dyeId,
      percent: percentFromRatio(component.ratio),
    }));
    const note = document.querySelector("#screen-match-note");
    if (note) note.innerHTML = `Formula updated for <strong>${escapeHtml(named.name)}</strong>. Test the result in wax before saving it.`;
    renderDyeRows();
  } catch {
    showToast("Choose a valid screen color.", "danger");
  }
}

function initializeColorWheel() {
  const canvas = document.querySelector("#color-wheel");
  let dragging = false;
  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    updateColorWheelFromPointer(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (dragging) updateColorWheelFromPointer(event);
  });
  const finishDrag = (event) => {
    const shouldApply = dragging;
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (shouldApply) applyColorWheelToFormula();
  };
  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("pointercancel", finishDrag);
  canvas.addEventListener("keydown", (event) => {
    const hueDelta = event.key === "ArrowLeft" ? -2 : event.key === "ArrowRight" ? 2 : 0;
    const saturationDelta = event.key === "ArrowDown" ? -0.02 : event.key === "ArrowUp" ? 0.02 : 0;
    if (!hueDelta && !saturationDelta) return;
    event.preventDefault();
    state.draft.wheelState.h = (state.draft.wheelState.h + hueDelta + 360) % 360;
    state.draft.wheelState.s = Math.max(0, Math.min(1, state.draft.wheelState.s + saturationDelta));
    updateColorWheelUi();
    applyColorWheelToFormula();
  });
  updateColorWheelUi({ redraw: true });
}

function scaleFieldsMarkup() {
  return `
    <div class="row g-3">
      <div class="col-md-6">
        <h3 class="form-subtitle">Wax scale</h3>
        <div class="row g-2">
          <div class="col-6"><label class="form-label" for="wax-readability">Readability (g)</label><input class="form-control" id="wax-readability" value="0.1" inputmode="decimal"></div>
          <div class="col-6"><label class="form-label" for="wax-capacity">Capacity (g)</label><input class="form-control" id="wax-capacity" value="5000" inputmode="decimal"></div>
        </div>
      </div>
      <div class="col-md-6">
        <h3 class="form-subtitle">Precision scale</h3>
        <div class="row g-2">
          <div class="col-6"><label class="form-label" for="dye-readability">Readability (g)</label><input class="form-control" id="dye-readability" value="0.001" inputmode="decimal"></div>
          <div class="col-6"><label class="form-label" for="dye-capacity">Capacity (g)</label><input class="form-control" id="dye-capacity" value="50" inputmode="decimal"></div>
        </div>
      </div>
    </div>`;
}

async function renderBatchBuilder(colorId, adjust = false) {
  releaseObjectUrls();
  setActiveNavigation("");
  const key = `${colorId ?? "new"}:${adjust}`;
  if (!state.draft || state.draft.key !== key) {
    state.draft = buildDraft(colorId, adjust);
    state.pendingPhotos = [];
  }
  const sourceOptions = visibleColors().map((color) => `
    <option value="${escapeHtml(color.id)}"${color.id === state.draft.sourceColorId ? " selected" : ""}>${escapeHtml(color.name)}${color.kind === "starter" ? " · starter" : ""}</option>
  `).join("");

  app.innerHTML = `
    <section class="page-shell batch-builder-page">
      <div class="container-xl">
        <a class="back-link" href="${colorId ? `#/color/${encodeURIComponent(colorId)}` : "#/library"}">← ${colorId ? "Color details" : "Color library"}</a>
        <div class="row g-4 mt-1">
          <div class="col-lg-5 col-xl-4">
            <div class="builder-intro sticky-lg-top">
              <p class="eyebrow">${adjust ? "Refine a saved color" : "Create with confidence"}</p>
              <h1 class="page-title">${adjust ? "Adjust the formula. Keep the history." : "Turn a color idea into a repeatable batch."}</h1>
              <p class="page-intro">${adjust ? "Your saved version stays untouched. When the new blend is right, save it as the next version or as a new color." : "Choose a starting formula, set the wax amount, and we’ll turn it into a clear color plan for a decorative molded-wax piece."}</p>
              <div class="alert alert-light border mt-4 mb-0 small"><strong>Decorative use only.</strong> This workspace is designed for molded wax pieces displayed on sticks, not products intended to be lit or burned.</div>
              <ol class="builder-steps">
                <li class="active"><span>1</span><div><strong>Build the formula</strong><small>Choose ratios and batch size</small></div></li>
                <li><span>2</span><div><strong>Record the result</strong><small>Capture actual amounts and photos</small></div></li>
                <li><span>3</span><div><strong>Save to your library</strong><small>Keep the formula and cost together</small></div></li>
              </ol>
            </div>
          </div>
          <div class="col-lg-7 col-xl-8">
            <form id="batch-form" novalidate>
              <section class="surface-card form-card p-4 p-md-5">
                <div class="form-section-heading">
                  <span>01</span><div><p class="eyebrow mb-1">Start with a color</p><h2 class="section-heading mb-0">Formula setup</h2></div>
                </div>
                <div class="row g-3 mt-2">
                  <div class="col-md-6"><label class="form-label" for="source-color">Starting color</label><select class="form-select form-select-lg" id="source-color">${sourceOptions}</select></div>
                  <div class="col-md-6"><label class="form-label" for="color-name">Name this color</label><input class="form-control form-control-lg" id="color-name" value="${escapeHtml(state.draft.name)}" maxlength="80" placeholder="e.g. Garden Rose"></div>
                </div>
                <div class="screen-reference mt-4">
                  <div>
                    <p class="mb-1 fw-bold">Explore the color wheel <span class="experimental-badge">Experimental</span></p>
                    <p class="small text-secondary mb-0">Tap or drag to choose a color. The editable dye ratios below update automatically when you release. Always confirm the result with a physical wax test.</p>
                  </div>
                  <div class="color-wheel-workspace mt-4">
                    <div class="color-wheel-wrap">
                      <canvas id="color-wheel" width="320" height="320" tabindex="0" role="slider" aria-label="Screen color: use touch, mouse, or arrow keys" aria-valuetext="${escapeHtml(state.draft.screenHex)}"></canvas>
                      <span id="wheel-marker" class="wheel-marker" aria-hidden="true"></span>
                    </div>
                    <div class="color-wheel-controls">
                      <div class="selected-color-card">
                        <span id="wheel-selected-swatch" style="background:${escapeHtml(state.draft.screenHex)}"></span>
                        <div><small>Selected screen color</small><strong id="wheel-selected-hex">${escapeHtml(state.draft.screenHex.toUpperCase())}</strong></div>
                      </div>
                      <label class="form-label" for="wheel-brightness">Brightness <span id="brightness-value">${Math.round(state.draft.wheelState.v * 100)}%</span></label>
                      <input class="form-range" id="wheel-brightness" type="range" min="8" max="100" step="1" value="${Math.round(state.draft.wheelState.v * 100)}">
                      <div class="screen-reference-controls">
                        <input type="color" id="screen-color" value="${escapeHtml(state.draft.screenHex)}" aria-label="Open the system color picker">
                        <input class="form-control" id="screen-hex" value="${escapeHtml(state.draft.screenHex)}" maxlength="7" aria-label="HEX screen color">
                      </div>
                      <div class="small wheel-status" id="screen-match-note">Move around the wheel. Your dye ratios will update when you release.</div>
                    </div>
                  </div>
                </div>

                <div class="d-flex align-items-center justify-content-between gap-3 mt-5 mb-3">
                  <div><label class="form-label mb-0">Dye ratios</label><p class="small text-secondary mb-0">Each percentage is a share of the total pure dye.</p></div>
                  <button class="btn btn-sm btn-outline-secondary" id="add-dye" type="button">+ Add dye</button>
                </div>
                <div id="dye-component-rows"></div>
                <div class="d-flex justify-content-end mt-2"><span class="ratio-total" id="ratio-total"></span></div>

                <div class="row g-3 mt-4">
                  <div class="col-md-4"><label class="form-label" for="wax-type">Wax type</label><select class="form-select form-select-lg" id="wax-type">${waxTypeOptions(state.draft.waxTypeId)}</select><div class="form-text">The selected wax determines the kit’s dye range.</div></div>
                  <div class="col-md-4"><label class="form-label" for="base-wax">Wax amount</label><div class="input-group input-group-lg"><input class="form-control" id="base-wax" value="${escapeHtml(state.draft.baseWaxG)}" inputmode="decimal"><span class="input-group-text">g</span></div><div class="form-text">Wax only, before dye, Vybar, or fragrance.</div></div>
                  <div class="col-md-4"><label class="form-label" for="dye-load">Dye strength</label><select class="form-select form-select-lg" id="dye-load">${dyeLoadOptions(state.draft.dyeLoadPct, state.draft.waxTypeId)}</select><div class="form-text" id="wax-guidance">${waxGuidanceMarkup(state.draft.waxTypeId)}</div></div>
                </div>

                <div class="optional-grid mt-4">
                  <label class="option-card"><input class="form-check-input" type="checkbox" id="additive-enabled"${state.draft.additiveEnabled ? " checked" : ""}><span><strong>Include Vybar</strong><small>Optional additive, measured by wax mass</small></span></label>
                  <label class="option-card"><input class="form-check-input" type="checkbox" id="fragrance-enabled"${state.draft.fragranceEnabled ? " checked" : ""}><span><strong>Include fragrance</strong><small>Calculate liquid volume from fl oz/lb</small></span></label>
                </div>
                <div class="row g-3 mt-3" id="optional-inputs">
                  <div class="col-md-4 additive-input"${state.draft.additiveEnabled ? "" : " hidden"}><label class="form-label" for="additive-load">Vybar load</label><div class="input-group"><input class="form-control" id="additive-load" value="${escapeHtml(state.draft.additiveLoadPct)}" inputmode="decimal"><span class="input-group-text">%</span></div></div>
                  <div class="col-md-4 fragrance-input"${state.draft.fragranceEnabled ? "" : " hidden"}><label class="form-label" for="fragrance-name">Fragrance name</label><input class="form-control" id="fragrance-name" value="${escapeHtml(state.draft.fragranceName)}" placeholder="e.g. Garden rose"></div>
                  <div class="col-md-4 fragrance-input"${state.draft.fragranceEnabled ? "" : " hidden"}><label class="form-label" for="fragrance-ratio">Bottle ratio</label><div class="input-group"><input class="form-control" id="fragrance-ratio" value="${escapeHtml(state.draft.fragranceRatio)}" inputmode="decimal"><span class="input-group-text">fl oz/lb</span></div></div>
                </div>

                <div class="accordion accordion-flush soft-accordion mt-4" id="technical-settings">
                  <div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#scale-settings"><span class="accordion-copy"><strong>Scale settings</strong><small>Make sure every amount can be weighed</small></span></button></h2><div id="scale-settings" class="accordion-collapse collapse"><div class="accordion-body px-0">${scaleFieldsMarkup()}</div></div></div>
                </div>

                <div class="alert alert-danger mt-4 mb-0" id="batch-error" role="alert" hidden></div>
                <button class="btn btn-brand btn-lg w-100 mt-4" type="submit">Calculate Color Plan <span aria-hidden="true">→</span></button>
              </section>
            </form>
            <div id="batch-result" class="mt-4"></div>
          </div>
        </div>
      </div>
    </section>`;

  renderDyeRows();
  attachBatchBuilderEvents();
  if (state.draft.result) renderBatchResult();
}

function attachBatchBuilderEvents() {
  document.querySelector("#source-color").addEventListener("change", (event) => applySourceColor(event.target.value));
  document.querySelector("#wax-type").addEventListener("change", (event) => applyWaxType(event.target.value));
  document.querySelector("#add-dye").addEventListener("click", () => {
    state.draft.components.push({ dyeId: DYES.find((dye) => !state.draft.components.some((item) => item.dyeId === dye.id))?.id ?? DYES[0].id, percent: "0" });
    renderDyeRows();
  });
  initializeColorWheel();
  document.querySelector("#screen-color").addEventListener("input", (event) => {
    setColorWheelFromHex(event.target.value);
    applyColorWheelToFormula();
  });
  document.querySelector("#screen-hex").addEventListener("input", (event) => {
    if (/^#?[0-9a-f]{6}$/i.test(event.target.value.trim())) {
      setColorWheelFromHex(event.target.value);
      applyColorWheelToFormula();
    }
  });
  document.querySelector("#screen-hex").addEventListener("change", (event) => {
    try {
      setColorWheelFromHex(event.target.value);
      applyColorWheelToFormula();
    } catch {
      showToast("Enter a six-digit HEX color such as #b63d69.", "danger");
    }
  });
  document.querySelector("#wheel-brightness").addEventListener("input", (event) => {
    state.draft.wheelState.v = Number(event.target.value) / 100;
    updateColorWheelUi({ redraw: true });
  });
  document.querySelector("#wheel-brightness").addEventListener("change", applyColorWheelToFormula);
  document.querySelector("#additive-enabled").addEventListener("change", (event) => {
    document.querySelector(".additive-input").hidden = !event.target.checked;
  });
  document.querySelector("#fragrance-enabled").addEventListener("change", (event) => {
    document.querySelectorAll(".fragrance-input").forEach((element) => { element.hidden = !event.target.checked; });
  });
  document.querySelector("#batch-form").addEventListener("submit", (event) => {
    event.preventDefault();
    calculateDraft();
  });
  document.querySelector("#batch-form").addEventListener("input", (event) => {
    event.target.classList.remove("is-invalid");
    event.target.removeAttribute("aria-invalid");
    event.target.closest(".formula-editor-row")?.classList.remove("field-invalid");
  });
}

function collectCalculationInput() {
  state.draft.name = document.querySelector("#color-name").value.trim();
  state.draft.waxTypeId = document.querySelector("#wax-type").value;
  state.draft.baseWaxG = document.querySelector("#base-wax").value.trim();
  state.draft.dyeLoadPct = document.querySelector("#dye-load").value.trim();
  state.draft.additiveEnabled = document.querySelector("#additive-enabled").checked;
  state.draft.additiveLoadPct = document.querySelector("#additive-load").value.trim();
  state.draft.fragranceEnabled = document.querySelector("#fragrance-enabled").checked;
  state.draft.fragranceName = document.querySelector("#fragrance-name").value.trim();
  state.draft.fragranceRatio = document.querySelector("#fragrance-ratio").value.trim();
  return {
    waxTypeId: state.draft.waxTypeId,
    baseWaxTargetG: state.draft.baseWaxG,
    dyeLoadPct: state.draft.dyeLoadPct,
    components: state.draft.components.map((component, index) => {
      try {
        return { dyeId: component.dyeId, ratio: ratioFromPercent(component.percent) };
      } catch {
        throw new DomainError("INVALID_DECIMAL", "Enter a valid dye percentage.", `components[${index}].ratio`);
      }
    }),
    scales: {
      wax: {
        id: "wax-scale",
        displayName: "Wax scale",
        readabilityG: document.querySelector("#wax-readability").value.trim(),
        capacityG: document.querySelector("#wax-capacity").value.trim(),
        minimumLoadG: null,
        verifiedRepeatabilityG: null,
        verifiedAccuracyG: null,
      },
      dye: {
        id: "dye-scale",
        displayName: "Precision scale",
        readabilityG: document.querySelector("#dye-readability").value.trim(),
        capacityG: document.querySelector("#dye-capacity").value.trim(),
        minimumLoadG: null,
        verifiedRepeatabilityG: null,
        verifiedAccuracyG: null,
      },
    },
    additive: {
      enabled: state.draft.additiveEnabled,
      name: VYBAR.displayName,
      loadPct: state.draft.additiveLoadPct,
    },
    fragrance: {
      enabled: state.draft.fragranceEnabled,
      name: state.draft.fragranceName,
      ratioFlOzPerLb: state.draft.fragranceRatio,
    },
    visualTarget: state.draft.visualTarget,
  };
}

function clearBatchValidation() {
  document.querySelectorAll("#batch-form .is-invalid").forEach((element) => {
    element.classList.remove("is-invalid");
    element.removeAttribute("aria-invalid");
  });
  document.querySelectorAll("#batch-form .field-invalid").forEach((element) => element.classList.remove("field-invalid"));
}

function batchValidationTargets(error) {
  const path = error instanceof DomainError ? error.fieldPath : null;
  const targets = [];
  const byId = (id) => document.querySelector(`#${id}`);
  const add = (...elements) => targets.push(...elements.filter(Boolean));

  if (error?.code === "SCALE_CAPACITY_EXCEEDED" || error?.code === "SCALE_BELOW_MINIMUM_LOAD") {
    if (path === "baseWaxTargetG") add(byId("base-wax"), byId("wax-capacity"));
    else add(byId("dye-capacity"));
  }

  if (path === "waxTypeId") add(byId("wax-type"));
  else if (path === "baseWaxTargetG") add(byId("base-wax"));
  else if (path === "dyeLoadPct") add(byId("dye-load"));
  else if (path === "components") add(...document.querySelectorAll(".component-percent"), byId("ratio-total"));
  else if (path?.startsWith("scales.wax.readability")) add(byId("wax-readability"));
  else if (path?.startsWith("scales.wax.capacity")) add(byId("wax-capacity"));
  else if (path?.startsWith("scales.dye.readability")) add(byId("dye-readability"));
  else if (path?.startsWith("scales.dye.capacity")) add(byId("dye-capacity"));
  else if (path === "additive.loadPct") add(byId("additive-load"));
  else if (path === "fragrance.ratioFlOzPerLb") add(byId("fragrance-ratio"));
  else if (path === "fragrance.basisG") add(byId("base-wax"));
  else if (path === "visualTarget.hex") add(byId("screen-hex"));

  const indexedComponent = /^components\[(\d+)\]\.(dyeId|ratio)$/.exec(path ?? "");
  if (indexedComponent) {
    const row = document.querySelectorAll(".formula-editor-row")[Number(indexedComponent[1])];
    add(row?.querySelector(indexedComponent[2] === "dyeId" ? ".component-dye" : ".component-percent"));
  } else if (path?.startsWith("components.")) {
    const dyeId = path.slice("components.".length);
    const row = [...document.querySelectorAll(".formula-editor-row")]
      .find((element) => element.querySelector(".component-dye")?.value === dyeId);
    add(row?.querySelector(".component-percent"));
  }

  return [...new Set(targets)];
}

function showBatchValidation(error) {
  const targets = batchValidationTargets(error);
  targets.forEach((target) => {
    target.classList.add("is-invalid");
    target.setAttribute("aria-invalid", "true");
    target.closest(".formula-editor-row")?.classList.add("field-invalid");
  });
  const firstInput = targets.find((target) => target.matches?.("input, select, textarea"));
  const collapsedPanel = firstInput?.closest(".accordion-collapse");
  if (collapsedPanel && window.bootstrap) window.bootstrap.Collapse.getOrCreateInstance(collapsedPanel).show();
  firstInput?.focus({ preventScroll: true });
  firstInput?.scrollIntoView({ behavior: "smooth", block: "center" });
  return targets.length;
}

function calculateDraft() {
  const errorNode = document.querySelector("#batch-error");
  clearBatchValidation();
  errorNode.hidden = true;
  try {
    const input = collectCalculationInput();
    const result = calculateWeighingPlan(input);
    state.draft.input = input;
    state.draft.result = result;
    state.draft.plannedRecipe = {
      waxTypeId: result.baseWax.waxTypeId,
      dyeLoadPct: result.dyeLoadPct,
      components: result.dosePlan.map((dose) => ({ dyeId: dose.dyeId, ratio: dose.ratio })),
    };
    renderBatchResult();
    document.querySelector("#batch-result").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    const highlighted = showBatchValidation(error);
    errorNode.innerHTML = `<strong>${highlighted ? "Check the highlighted field." : "Check the color plan."}</strong> ${escapeHtml(error instanceof Error ? error.message : "The color plan could not be calculated.")}`;
    errorNode.hidden = false;
    if (!highlighted) errorNode.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function productionRows(result) {
  const rows = [
    {
      id: "actual-wax",
      label: result.baseWax.materialName,
      detail: "Base wax",
      target: result.baseWax.scale.displayableTargetG,
      unit: "g",
    },
    ...result.dosePlan.map((dose) => ({
      id: `actual-dye-${dose.dyeId}`,
      label: `${dose.dyeName} dye`,
      detail: `${percentFromRatio(dose.ratio)}% of pure dye`,
      target: dose.scale.displayableTargetG,
      unit: "g",
    })),
  ];
  if (result.additive) rows.push({
    id: "actual-additive",
    label: result.additive.name,
    detail: `${result.additive.loadPct}% of base wax`,
    target: result.additive.scale.displayableTargetG,
    unit: "g",
  });
  if (result.fragrance) rows.push({
    id: "actual-fragrance",
    label: result.fragrance.name,
    detail: `${result.fragrance.ratioFlOzPerLb} fl oz/lb`,
    target: result.fragrance.targetMl,
    unit: "mL",
  });
  return rows;
}

function renderBatchResult() {
  const result = state.draft.result;
  const root = document.querySelector("#batch-result");
  const rows = productionRows(result);
  const sourceColor = colorById(state.draft.sourceColorId);
  const defaultMode = !sourceColor || (!state.draft.adjust && sourceColor.kind === "starter") ? "new-color" : state.draft.adjust ? (sourceColor.kind === "personal" ? "new-version" : "new-color") : "batch-only";
  root.innerHTML = `
    <section class="surface-card result-card overflow-hidden">
      <div class="result-banner p-4 p-md-5">
        <p class="eyebrow">Your color plan</p>
        <div class="d-flex flex-column flex-md-row align-items-md-end justify-content-between gap-3">
          <div><h2 class="result-title">${escapeHtml(state.draft.name || sourceColor?.name || "New color")}</h2><p class="mb-0">Exact targets, translated into amounts your scales can display.</p></div>
          <button class="btn btn-light" type="button" id="print-plan">Print plan</button>
        </div>
        <div class="summary-strip row g-2 mt-4">
          <div class="col-4"><span>Base wax</span><strong>${formatMass(result.baseWax.targetTotalG)}</strong></div>
          <div class="col-4"><span>Pure dye</span><strong>${formatMass(result.pureDyeTotalG)}</strong></div>
          <div class="col-4"><span>${result.fragrance ? "Known mass" : "Finished mass"}</span><strong>${formatMass(result.knownFormulationMassBeforeFragranceG)}</strong></div>
        </div>
      </div>
      <div class="p-4 p-md-5">
        <div class="d-flex align-items-end justify-content-between gap-3 mt-4 mb-3">
          <div><p class="eyebrow mb-1">Production order</p><h3 class="section-heading mb-0">Weigh each ingredient</h3></div>
          <span class="small text-secondary">Target → actual</span>
        </div>
        <div class="table-responsive">
          <table class="table production-table align-middle">
            <thead><tr><th>Ingredient</th><th>Exact target</th><th>Scale target</th></tr></thead>
            <tbody>
              <tr><td><strong>${escapeHtml(result.baseWax.materialName)}</strong><small>Base wax</small></td><td>${formatMass(result.baseWax.targetTotalG)}</td><td><strong>${formatMass(result.baseWax.scale.displayableTargetG)}</strong></td></tr>
              ${result.dosePlan.map((dose) => `<tr><td><strong>${escapeHtml(dose.dyeName)} dye</strong><small>${percentFromRatio(dose.ratio)}% of pure dye</small></td><td>${formatMass(dose.targetPureDyeG)}</td><td><strong>${formatMass(dose.scale.displayableTargetG)}</strong></td></tr>`).join("")}
              ${result.additive ? `<tr><td><strong>${escapeHtml(result.additive.name)}</strong><small>${result.additive.loadPct}% of base wax</small></td><td>${formatMass(result.additive.targetG)}</td><td><strong>${formatMass(result.additive.scale.displayableTargetG)}</strong></td></tr>` : ""}
              ${result.fragrance ? `<tr><td><strong>${escapeHtml(result.fragrance.name)}</strong><small>${result.fragrance.ratioFlOzPerLb} fl oz/lb</small></td><td>${formatVolume(result.fragrance.targetMl)}</td><td><strong>${formatVolume(result.fragrance.targetMl)}</strong></td></tr>` : ""}
            </tbody>
          </table>
        </div>

        <div class="process-callout mt-4">
          <strong>For an even color</strong>
          <span>Add dye after the wax is fully melted. Dissolve at no less than about ${processGuidance.minimumDyeDissolveTemperatureF}°F, keep dye below about ${processGuidance.maximumRecommendedDyeTemperatureF}°F, and mix for ${processGuidance.minimumMixMinutes}–${processGuidance.maximumMixMinutes} minutes until completely dissolved.</span>
        </div>

        <hr class="section-divider">
        <div class="form-section-heading">
          <span>02</span><div><p class="eyebrow mb-1">Record what happened</p><h3 class="section-heading mb-0">What did you actually use?</h3></div>
        </div>
        <p class="section-copy mt-3">The plan is prefilled below. If you added a little more while mixing, change the actual amount so the saved formula reflects the batch in front of you.</p>
        <div class="actual-grid mt-4">
          ${rows.map((row) => `
            <label class="actual-row" for="${escapeHtml(row.id)}">
              <span><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.detail)}</small></span>
              <span class="actual-target">Planned ${row.unit === "g" ? formatMass(row.target) : formatVolume(row.target)}</span>
              <span class="input-group"><input class="form-control actual-input" id="${escapeHtml(row.id)}" value="${escapeHtml(row.target)}" inputmode="decimal"><span class="input-group-text">${row.unit}</span></span>
            </label>`).join("")}
        </div>
        <div class="row g-3 mt-3">
          <div class="col-md-4"><label class="form-label" for="batch-yield">Finished pieces <span class="text-secondary fw-normal">(optional)</span></label><input class="form-control" id="batch-yield" inputmode="numeric" placeholder="e.g. 12"></div>
          <div class="col-md-8"><label class="form-label" for="batch-notes">Batch notes</label><textarea class="form-control" id="batch-notes" rows="2" placeholder="Pour temperature, cooling notes, or what you would change next time"></textarea></div>
        </div>

        <div class="cost-preview mt-4" id="cost-preview"></div>

        <hr class="section-divider">
        <div class="form-section-heading">
          <span>03</span><div><p class="eyebrow mb-1">Capture the result</p><h3 class="section-heading mb-0">Add photos</h3></div>
        </div>
        <p class="section-copy mt-3">Take a photo now or add a cured-wax photo later. Photos are visual references; lighting and cameras can change how color appears.</p>
        <div class="row g-3 mt-3">
          <div class="col-md-5">
            <label class="photo-button" for="camera-photo"><span aria-hidden="true">◎</span><strong>Take a photo</strong><small>Use the back camera</small></label>
            <input class="visually-hidden" id="camera-photo" type="file" accept="image/*" capture="environment">
          </div>
          <div class="col-md-5">
            <label class="photo-button" for="gallery-photos"><span aria-hidden="true">▧</span><strong>Choose photos</strong><small>Select one or more</small></label>
            <input class="visually-hidden" id="gallery-photos" type="file" accept="image/*" multiple>
          </div>
          <div class="col-md-2">
            <label class="form-label" for="photo-stage">Stage</label>
            <select class="form-select" id="photo-stage"><option value="fresh">Fresh pour</option><option value="cured">Cured wax</option><option value="finished">Finished piece</option></select>
          </div>
        </div>
        <div class="pending-photo-grid mt-3" id="pending-photos"></div>

        <hr class="section-divider">
        <div class="save-panel">
          <div><p class="eyebrow mb-1">Keep this work</p><h3 class="section-heading mb-1">Save the batch</h3><p class="section-copy mb-0">Choose how this formula should appear in your library.</p></div>
          <div class="save-options">
            ${sourceColor ? `<label><input class="form-check-input" type="radio" name="save-mode" value="batch-only"${defaultMode === "batch-only" ? " checked" : ""}><span><strong>Record this batch</strong><small>Keep the current saved formula</small></span></label>` : ""}
            ${sourceColor?.kind === "personal" ? `<label><input class="form-check-input" type="radio" name="save-mode" value="new-version"${defaultMode === "new-version" ? " checked" : ""}><span><strong>Save as the next version</strong><small>Use the actual mix next time</small></span></label>` : ""}
            <label><input class="form-check-input" type="radio" name="save-mode" value="new-color"${defaultMode === "new-color" ? " checked" : ""}><span><strong>Save as a new color</strong><small>Add the actual mix to your library</small></span></label>
          </div>
          <div class="alert alert-danger mt-3" id="save-error" hidden></div>
          <button class="btn btn-brand btn-lg w-100 mt-3" id="save-batch" type="button">Save batch to my library</button>
          <p class="local-save-note"><span aria-hidden="true">●</span> Saved privately on this device. Nothing is uploaded.</p>
        </div>
      </div>
    </section>`;

  document.querySelector("#print-plan").addEventListener("click", () => window.print());
  document.querySelectorAll(".actual-input, #batch-yield").forEach((input) => input.addEventListener("input", updateCostPreview));
  document.querySelector("#camera-photo").addEventListener("change", handlePhotoFiles);
  document.querySelector("#gallery-photos").addEventListener("change", handlePhotoFiles);
  document.querySelector("#save-batch").addEventListener("click", saveCurrentBatch);
  renderPendingPhotos();
  updateCostPreview();
}

function actualsFromForm() {
  const result = state.draft.result;
  return {
    baseWaxG: document.querySelector("#actual-wax").value.trim(),
    dyes: result.dosePlan.map((dose) => ({
      dyeId: dose.dyeId,
      plannedG: dose.scale.displayableTargetG,
      actualG: document.querySelector(`#actual-dye-${CSS.escape(dose.dyeId)}`).value.trim(),
    })),
    additiveG: result.additive ? document.querySelector("#actual-additive").value.trim() : null,
    fragranceMl: result.fragrance ? document.querySelector("#actual-fragrance").value.trim() : null,
  };
}

function batchCostLines(actuals) {
  const result = state.draft.result;
  const lines = [{
    materialId: result.baseWax.materialId,
    label: result.baseWax.materialName,
    quantity: actuals.baseWaxG,
    baseUnit: "g",
  }];
  actuals.dyes.forEach((dye) => lines.push({
    materialId: dye.dyeId,
    fallbackMaterialId: "dye-default",
    label: `${DYE_BY_ID.get(dye.dyeId).displayName} dye`,
    quantity: dye.actualG,
    baseUnit: "g",
  }));
  if (result.additive) lines.push({
    materialId: result.additive.materialId,
    label: result.additive.name,
    quantity: actuals.additiveG,
    baseUnit: "g",
  });
  if (result.fragrance) lines.push({
    materialId: `fragrance:${slug(result.fragrance.name)}`,
    fallbackMaterialId: "fragrance-default",
    label: result.fragrance.name,
    quantity: actuals.fragranceMl,
    baseUnit: "ml",
  });
  return lines;
}

function currentCostSnapshot() {
  const actuals = actualsFromForm();
  return calculateBatchCost(batchCostLines(actuals), latestRates());
}

function updateCostPreview() {
  const node = document.querySelector("#cost-preview");
  if (!node) return;
  try {
    const cost = currentCostSnapshot();
    const yieldValue = document.querySelector("#batch-yield").value.trim();
    const perPiece = yieldValue && Number(yieldValue) > 0 ? Number(cost.total) / Number(yieldValue) : null;
    node.innerHTML = `
      <div><span class="cost-icon" aria-hidden="true">$</span><span><strong>Estimated ingredient cost</strong><small>${cost.complete ? "Every ingredient has a saved price." : `${cost.unpriced.length} ingredient${cost.unpriced.length === 1 ? "" : "s"} still need a price.`}</small></span></div>
      <div class="text-end"><strong class="cost-total">${formatMoney(cost.total)}</strong>${perPiece !== null ? `<small>${formatMoney(perPiece)} per piece</small>` : ""}</div>
      ${cost.complete ? "" : `<a href="#/materials">Add missing prices</a>`}`;
  } catch {
    node.innerHTML = `<div><span class="cost-icon" aria-hidden="true">$</span><span><strong>Cost appears here</strong><small>Enter valid actual amounts to estimate this batch.</small></span></div>`;
  }
}

async function handlePhotoFiles(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  const button = event.target.previousElementSibling;
  button.classList.add("photo-loading");
  try {
    for (const file of files) state.pendingPhotos.push(await preparePhoto(file));
    renderPendingPhotos();
    showToast(`${files.length} photo${files.length === 1 ? "" : "s"} ready to save.`);
  } catch (error) {
    showToast(error.message, "danger");
  } finally {
    button.classList.remove("photo-loading");
    event.target.value = "";
  }
}

function renderPendingPhotos() {
  const container = document.querySelector("#pending-photos");
  if (!container) return;
  container.innerHTML = state.pendingPhotos.map((photo, index) => `
    <figure><img src="${objectUrl(photo.thumbnailBlob)}" alt="Photo ready to save"><button type="button" data-remove-photo="${index}" aria-label="Remove photo">×</button><figcaption>${escapeHtml(photo.fileName)}</figcaption></figure>
  `).join("");
  container.querySelectorAll("[data-remove-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pendingPhotos.splice(Number(button.dataset.removePhoto), 1);
      renderPendingPhotos();
    });
  });
}

async function saveCurrentBatch() {
  const errorNode = document.querySelector("#save-error");
  errorNode.hidden = true;
  const button = document.querySelector("#save-batch");
  button.disabled = true;
  button.textContent = "Saving your batch…";
  try {
    const name = document.querySelector("#color-name").value.trim();
    if (!name) throw new Error("Give this color a name before saving.");
    const actuals = actualsFromForm();
    const actualRecipe = {
      ...deriveActualRecipe({
      baseWaxActualG: actuals.baseWaxG,
      dyeActuals: actuals.dyes,
      }),
      waxTypeId: state.draft.result.baseWax.waxTypeId,
    };
    const costSnapshot = currentCostSnapshot();
    const saveMode = document.querySelector("input[name='save-mode']:checked")?.value ?? "new-color";
    const sourceColor = colorById(state.draft.sourceColorId);
    const now = new Date().toISOString();
    let colorId = sourceColor?.id;
    let colorRecord = null;
    let recipeVersion = null;

    if (saveMode === "new-color" || !sourceColor) {
      colorId = createId("color");
      colorRecord = {
        schemaVersion: 1,
        id: colorId,
        kind: "personal",
        name,
        screenHex: state.draft.screenHex ?? sourceColor?.screenHex ?? "#d8d1c2",
        status: "testing",
        currentRecipeVersion: 1,
        archived: false,
        coverPhotoId: state.pendingPhotos[0]?.id ?? null,
        createdUtc: now,
        modifiedUtc: now,
        notes: null,
      };
      recipeVersion = {
        schemaVersion: 1,
        id: `${colorId}:v1`,
        colorId,
        version: 1,
        sourceType: "pinewood_blooms",
        verificationStatus: "testing",
        derivedFromTemplateId: state.draft.visualTarget?.matchedTemplateId ?? sourceColor?.templateId ?? recipeForColor(sourceColor)?.derivedFromTemplateId ?? null,
        waxTypeId: actualRecipe.waxTypeId,
        dyeLoadPct: actualRecipe.dyeLoadPct,
        components: actualRecipe.components,
        additive: state.draft.result.additive ? { loadPct: state.draft.result.additive.loadPct } : null,
        fragrance: state.draft.result.fragrance ? { name: state.draft.result.fragrance.name, ratioFlOzPerLb: state.draft.result.fragrance.ratioFlOzPerLb } : null,
        createdUtc: now,
        notes: recipeChanged(state.draft.plannedRecipe, actualRecipe) ? "Created from the actual amounts recorded for this batch." : "Created from the calculated weighing plan.",
      };
    } else if (saveMode === "new-version") {
      const nextVersion = sourceColor.currentRecipeVersion + 1;
      colorRecord = { ...sourceColor, name, currentRecipeVersion: nextVersion, modifiedUtc: now };
      recipeVersion = {
        ...recipeForColor(sourceColor),
        id: `${sourceColor.id}:v${nextVersion}`,
        version: nextVersion,
        waxTypeId: actualRecipe.waxTypeId,
        dyeLoadPct: actualRecipe.dyeLoadPct,
        components: actualRecipe.components,
        createdUtc: now,
        notes: "New version created from actual batch measurements.",
      };
    } else if (sourceColor?.kind === "personal") {
      colorRecord = {
        ...sourceColor,
        name,
        coverPhotoId: sourceColor.coverPhotoId ?? state.pendingPhotos[0]?.id ?? null,
        modifiedUtc: now,
      };
    }

    const batchId = createId("batch");
    const stage = document.querySelector("#photo-stage").value;
    const stageLabel = { fresh: "Fresh pour", cured: "Cured wax", finished: "Finished piece" }[stage];
    const photos = state.pendingPhotos.map((photo) => ({
      ...photo,
      colorId,
      batchId,
      stage,
      stageLabel,
      measurementQuality: "photo_uncontrolled",
      notes: null,
    }));
    const yieldText = document.querySelector("#batch-yield").value.trim();
    const batch = {
      schemaVersion: 1,
      id: batchId,
      colorId,
      recipeVersion: recipeVersion?.version ?? recipeForColor(sourceColor)?.version ?? 1,
      plannedInput: structuredClone(state.draft.input),
      plannedResult: structuredClone(state.draft.result),
      actuals,
      derivedActualRecipe: actualRecipe,
      formulaAdjusted: recipeChanged(state.draft.plannedRecipe, actualRecipe),
      costSnapshot: {
        ...costSnapshot,
        capturedUtc: now,
        yieldCount: yieldText || null,
        costPerPiece: yieldText && Number(yieldText) > 0
          ? ExactDecimal.parse(costSnapshot.total).divide(ExactDecimal.parse(yieldText)).toSignificant(24)
          : null,
      },
      resultStatus: photos.length ? "observed" : "pending_observation",
      photosCount: photos.length,
      producedUtc: now,
      createdUtc: now,
      modifiedUtc: now,
      notes: document.querySelector("#batch-notes").value.trim() || null,
    };
    await saveBatchBundle({ color: colorRecord, recipeVersion, batch, photos });
    await setSetting("lastChangeUtc", now);
    state.pendingPhotos = [];
    state.draft = null;
    await refreshState();
    showToast("Batch saved to your color library.");
    location.hash = `#/color/${encodeURIComponent(colorId)}`;
  } catch (error) {
    errorNode.textContent = error instanceof Error ? error.message : "The batch could not be saved.";
    errorNode.hidden = false;
    errorNode.scrollIntoView({ behavior: "smooth", block: "center" });
  } finally {
    button.disabled = false;
    button.textContent = "Save batch to my library";
  }
}

async function renderBatchDetail(batchId) {
  releaseObjectUrls();
  setActiveNavigation("library");
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch) return renderNotFound();
  const color = colorById(batch.colorId);
  const photos = state.photos.filter((photo) => photo.batchId === batch.id);
  app.innerHTML = `
    <section class="page-shell">
      <div class="container-lg">
        <a class="back-link" href="#/color/${encodeURIComponent(batch.colorId)}">← ${escapeHtml(color?.name ?? "Color")}</a>
        <div class="d-flex flex-column flex-md-row align-items-md-end justify-content-between gap-3 mt-4">
          <div><p class="eyebrow">Recorded batch</p><h1 class="page-title">${escapeHtml(color?.name ?? "Saved color")}</h1><p class="page-intro">Made ${formatDate(batch.producedUtc)} · ${formatMass(batch.actuals.baseWaxG)} base wax</p></div>
          <a class="btn btn-brand" href="#/batch/new?color=${encodeURIComponent(batch.colorId)}">Create this batch again</a>
        </div>
        <div class="row g-4 mt-4">
          <div class="col-lg-7">
            <section class="surface-card p-4 p-md-5">
              <div class="d-flex justify-content-between align-items-end gap-3"><div><p class="eyebrow">As made</p><h2 class="section-heading mb-0">Actual formula</h2></div><span class="load-pill">${formatPercent(batch.derivedActualRecipe.dyeLoadPct)}% dye load</span></div>
              <div class="formula-list mt-4">${batch.actuals.dyes.map((dye) => `<div><span><i class="dye-dot dye-${escapeHtml(dye.dyeId.replace("candle-shop-", ""))}"></i>${escapeHtml(DYE_BY_ID.get(dye.dyeId)?.displayName)} dye</span><strong>${formatMass(dye.actualG)}</strong></div>`).join("")}</div>
              ${batch.formulaAdjusted ? `<div class="alert alert-info soft-alert mt-4 mb-0"><strong>This batch was adjusted.</strong> The actual mixture is preserved separately from the original weighing plan.</div>` : ""}
              ${batch.notes ? `<div class="batch-notes mt-4"><strong>Batch notes</strong><p class="mb-0">${escapeHtml(batch.notes)}</p></div>` : ""}
            </section>
          </div>
          <div class="col-lg-5">
            <section class="surface-card p-4 p-md-5 mb-4">
              <p class="eyebrow">Ingredient cost</p><div class="d-flex justify-content-between align-items-end"><h2 class="section-heading mb-0">${formatMoney(batch.costSnapshot?.total)}</h2><span class="small text-secondary">${batch.costSnapshot?.complete ? "Complete" : "Partial"} estimate</span></div>
              <div class="cost-lines mt-4">${batch.costSnapshot?.priced.map((line) => `<div><span>${escapeHtml(line.label)}</span><strong>${formatMoney(line.cost)}</strong></div>`).join("") ?? ""}</div>
              ${batch.costSnapshot?.costPerPiece ? `<div class="cost-per-piece mt-3"><span>Cost per piece</span><strong>${formatMoney(batch.costSnapshot.costPerPiece)}</strong></div>` : ""}
            </section>
          </div>
        </div>
        ${photos.length ? `<section class="mt-5"><p class="eyebrow">Batch photos</p><div class="photo-gallery mt-3">${photos.map((photo) => `<figure><img src="${objectUrl(photo.imageBlob)}" alt="${escapeHtml(photo.stageLabel)} photo"><figcaption>${escapeHtml(photo.stageLabel)}</figcaption></figure>`).join("")}</div></section>` : ""}
      </div>
    </section>`;
}

function currentPriceFor(material) {
  return state.prices.find((price) => price.id === material.currentPriceId) ?? null;
}

function unitOptions(group, selected = null) {
  const labels = { g: "grams", kg: "kilograms", oz: "ounces", lb: "pounds", ml: "milliliters", "fl-oz": "US fluid ounces", each: "items" };
  return Object.keys(UNIT_GROUPS[group]).map((unit) => `<option value="${unit}"${unit === selected ? " selected" : ""}>${labels[unit]}</option>`).join("");
}

async function renderMaterials() {
  releaseObjectUrls();
  setActiveNavigation("materials");
  const materials = state.materials.filter((material) => !material.archived);
  app.innerHTML = `
    <section class="page-shell">
      <div class="container-lg">
        <div class="row align-items-end g-4">
          <div class="col-lg-8"><p class="eyebrow">Materials &amp; costs</p><h1 class="page-title">Enter a purchase once. Price every batch automatically.</h1><p class="page-intro">Tell us what you paid and how much you received. We’ll normalize the unit cost and preserve the price used for every saved batch.</p></div>
          <div class="col-lg-4"><div class="privacy-card"><span aria-hidden="true">●</span><div><strong>Private to this device</strong><small>Prices are stored locally with your formulas.</small></div></div></div>
        </div>

        <div class="material-list mt-5">
          ${materials.map((material) => {
            const price = currentPriceFor(material);
            return `<article class="material-card">
              <span class="material-icon material-${escapeHtml(material.category)}">${{ wax: "W", dye: "D", additive: "A", fragrance: "F" }[material.category] ?? "M"}</span>
              <div class="material-copy"><p class="card-kicker">${escapeHtml(material.category)}</p><h2>${escapeHtml(material.name)}</h2><p>${escapeHtml(material.description)}</p></div>
              <div class="material-price">${price ? `<strong>${formatMoney(price.purchasePrice)}</strong><span>per ${escapeHtml(price.purchaseQuantity)} ${escapeHtml(price.purchaseUnit)}</span><small>${formatMoney(price.costPerBaseUnit)} / ${escapeHtml(price.baseUnit)}</small>` : `<strong>Not priced</strong><span>Add a recent purchase</span>`}<button class="btn btn-outline-secondary btn-sm edit-material" data-material-id="${escapeHtml(material.id)}" type="button">${price ? "Update price" : "Add price"}</button></div>
            </article>`;
          }).join("")}
        </div>

        <section class="surface-card form-card p-4 p-md-5 mt-4" id="price-form-card">
          <p class="eyebrow">Add a purchase</p><h2 class="section-heading">What did you pay?</h2>
          <p class="section-copy">Use the quantity printed on the package. The app handles pounds, ounces, kilograms, grams, fluid ounces, and milliliters.</p>
          <form id="price-form" class="row g-3 mt-2" novalidate>
            <div class="col-md-5"><label class="form-label" for="price-material">Material</label><select class="form-select form-select-lg" id="price-material">${materials.map((material) => `<option value="${escapeHtml(material.id)}">${escapeHtml(material.name)}</option>`).join("")}</select></div>
            <div class="col-md-3"><label class="form-label" for="purchase-price">Total paid</label><div class="input-group input-group-lg"><span class="input-group-text">$</span><input class="form-control" id="purchase-price" inputmode="decimal" placeholder="31.50"></div></div>
            <div class="col-md-2"><label class="form-label" for="purchase-quantity">Package size</label><input class="form-control form-control-lg" id="purchase-quantity" inputmode="decimal" placeholder="10"></div>
            <div class="col-md-2"><label class="form-label" for="purchase-unit">Unit</label><select class="form-select form-select-lg" id="purchase-unit">${unitOptions(materials[0].unitGroup, "lb")}</select></div>
            <div class="col-12"><div class="alert alert-danger mb-0" id="price-error" hidden></div></div>
            <div class="col-12"><button class="btn btn-brand btn-lg" type="submit">Save material price</button></div>
          </form>
        </section>
        <div class="technical-note mt-4">The average dye and fragrance prices are fallbacks. They keep early estimates useful when you have not priced every individual color or fragrance. Every batch stores the exact unit rates used at the time.</div>
      </div>
    </section>`;

  const materialSelect = document.querySelector("#price-material");
  const updateUnits = () => {
    const material = state.materials.find((item) => item.id === materialSelect.value);
    document.querySelector("#purchase-unit").innerHTML = unitOptions(material.unitGroup, material.unitGroup === "mass" ? "g" : "ml");
  };
  materialSelect.addEventListener("change", updateUnits);
  document.querySelectorAll(".edit-material").forEach((button) => button.addEventListener("click", () => {
    materialSelect.value = button.dataset.materialId;
    updateUnits();
    const material = state.materials.find((item) => item.id === button.dataset.materialId);
    const price = currentPriceFor(material);
    document.querySelector("#purchase-price").value = price?.purchasePrice ?? "";
    document.querySelector("#purchase-quantity").value = price?.purchaseQuantity ?? "";
    if (price) document.querySelector("#purchase-unit").value = price.purchaseUnit;
    document.querySelector("#price-form-card").scrollIntoView({ behavior: "smooth", block: "center" });
    document.querySelector("#purchase-price").focus();
  }));
  document.querySelector("#price-form").addEventListener("submit", saveMaterialPrice);
}

async function saveMaterialPrice(event) {
  event.preventDefault();
  const errorNode = document.querySelector("#price-error");
  errorNode.hidden = true;
  try {
    const material = state.materials.find((item) => item.id === document.querySelector("#price-material").value);
    const purchasePrice = document.querySelector("#purchase-price").value.trim();
    const purchaseQuantity = document.querySelector("#purchase-quantity").value.trim();
    const purchaseUnit = document.querySelector("#purchase-unit").value;
    const normalized = normalizePurchaseCost({
      price: purchasePrice,
      quantity: purchaseQuantity,
      unit: purchaseUnit,
      unitGroup: material.unitGroup,
    });
    const now = new Date().toISOString();
    const price = {
      schemaVersion: 1,
      id: createId(`price-${slug(material.id)}`),
      materialId: material.id,
      purchasePrice,
      purchaseQuantity,
      purchaseUnit,
      currency: "USD",
      effectiveUtc: now,
      createdUtc: now,
      ...normalized,
    };
    await saveMaterialAndPrice({ ...material, currentPriceId: price.id, modifiedUtc: now }, price);
    await setSetting("lastChangeUtc", now);
    await refreshState();
    showToast(`${material.name} price saved.`);
    await renderMaterials();
  } catch (error) {
    errorNode.textContent = error instanceof Error ? error.message : "The price could not be saved.";
    errorNode.hidden = false;
  }
}

async function renderBackup() {
  releaseObjectUrls();
  setActiveNavigation("backup");
  const lastBackupUtc = await getSetting("lastBackupUtc", null);
  const lastChangeUtc = await getSetting("lastChangeUtc", null);
  const estimate = navigator.storage?.estimate
    ? await navigator.storage.estimate().catch(() => null)
    : null;
  const storageText = estimate ? `${(estimate.usage / 1024 / 1024).toFixed(1)} MB used on this device` : "Stored privately on this device";
  const needsBackup = lastChangeUtc && (!lastBackupUtc || lastChangeUtc > lastBackupUtc);
  app.innerHTML = `
    <section class="page-shell">
      <div class="container-lg">
        <div class="row g-4 align-items-end">
          <div class="col-lg-8"><p class="eyebrow">Backup &amp; restore</p><h1 class="page-title">Your color library belongs to you.</h1><p class="page-intro">Download one portable backup containing your colors, formula versions, batch history, prices, and photos.</p></div>
          <div class="col-lg-4"><div class="backup-status ${needsBackup ? "needs-backup" : ""}"><span aria-hidden="true">${needsBackup ? "!" : "✓"}</span><div><strong>${needsBackup ? "New work needs a backup" : lastBackupUtc ? "Your latest work is backed up" : "Create your first backup"}</strong><small>${lastBackupUtc ? `Last backup ${formatDate(lastBackupUtc)}` : storageText}</small></div></div></div>
        </div>

        <div class="row g-4 mt-4">
          <div class="col-lg-6">
            <section class="surface-card backup-card p-4 p-md-5 h-100">
              <span class="backup-icon" aria-hidden="true">↓</span>
              <p class="eyebrow mt-4">Protect your work</p><h2 class="section-heading">Download a complete backup</h2>
              <p class="section-copy">Save the file to iCloud Drive, Google Drive, Dropbox, or another safe location. Nothing is uploaded by the app.</p>
              <div class="backup-counts">
                <span><strong>${state.colors.length}</strong> saved colors</span>
                <span><strong>${state.batches.length}</strong> batches</span>
                <span><strong>${state.photos.length}</strong> photos</span>
              </div>
              <button class="btn btn-brand btn-lg w-100 mt-4" id="download-backup" type="button">Download my backup</button>
            </section>
          </div>
          <div class="col-lg-6">
            <section class="surface-card backup-card p-4 p-md-5 h-100">
              <span class="backup-icon secondary" aria-hidden="true">↑</span>
              <p class="eyebrow mt-4">Bring your library back</p><h2 class="section-heading">Restore from a backup</h2>
              <p class="section-copy">The file is checked before anything changes. Merge adds non-conflicting records; replace starts from the selected backup.</p>
              <label class="file-drop mt-4" for="backup-file"><strong>Choose a Wax Color Studio backup</strong><small id="backup-file-name">.ccm-backup.json</small></label>
              <input class="visually-hidden" id="backup-file" type="file" accept=".json,.ccm-backup.json,application/json">
              <div class="restore-options mt-3">
                <label><input class="form-check-input" type="radio" name="restore-mode" value="merge" checked><span><strong>Merge safely</strong><small>Stop if the same record is different</small></span></label>
                <label><input class="form-check-input" type="radio" name="restore-mode" value="replace"><span><strong>Replace this library</strong><small>Use only the selected backup</small></span></label>
              </div>
              <div class="alert mt-3" id="restore-message" hidden></div>
              <button class="btn btn-outline-dark btn-lg w-100 mt-3" id="restore-backup" type="button" disabled>Restore selected backup</button>
            </section>
          </div>
        </div>
        <div class="privacy-explainer mt-4"><strong>Why backups matter</strong><span>This is a local-only app. Clearing website data, replacing a phone, or uninstalling the web app can remove its library. A downloaded backup is the only recovery copy.</span></div>
      </div>
    </section>`;

  document.querySelector("#download-backup").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Preparing photos and records…";
    try {
      await downloadBackup();
      showToast("Backup downloaded. Keep it somewhere safe.");
      await renderBackup();
    } catch (error) {
      showToast(error.message, "danger");
      button.disabled = false;
      button.textContent = "Download my backup";
    }
  });
  document.querySelector("#backup-file").addEventListener("change", inspectSelectedBackup);
  document.querySelector("#restore-backup").addEventListener("click", restoreSelectedBackup);
}

async function inspectSelectedBackup(event) {
  const file = event.target.files[0];
  const message = document.querySelector("#restore-message");
  if (!file) return;
  document.querySelector("#backup-file-name").textContent = file.name;
  message.hidden = false;
  message.className = "alert alert-info mt-3";
  message.textContent = "Checking the backup…";
  try {
    state.importInspection = { file, ...(await inspectBackupFile(file)) };
    const manifest = state.importInspection.payload.manifest;
    message.className = "alert alert-success mt-3";
    message.textContent = `Ready to restore: ${manifest.colors} colors, ${manifest.batches} batches, and ${manifest.photos} photos.`;
    document.querySelector("#restore-backup").disabled = false;
  } catch (error) {
    state.importInspection = null;
    message.className = "alert alert-danger mt-3";
    message.textContent = error.message;
    document.querySelector("#restore-backup").disabled = true;
  }
}

async function restoreSelectedBackup() {
  if (!state.importInspection) return;
  const mode = document.querySelector("input[name='restore-mode']:checked").value;
  if (mode === "replace" && !confirm("Replace this device’s entire color library with the selected backup? This cannot be undone unless you have another backup.")) return;
  const button = document.querySelector("#restore-backup");
  const message = document.querySelector("#restore-message");
  button.disabled = true;
  button.textContent = "Restoring your library…";
  try {
    const result = await restoreBackup(state.importInspection.file, mode);
    if (!result.restored) {
      message.className = "alert alert-danger mt-3";
      message.textContent = `Nothing was changed. ${result.conflicts.length} record conflict${result.conflicts.length === 1 ? "" : "s"} must be resolved by using Replace or a different backup.`;
      return;
    }
    await ensureDefaultMaterials();
    await refreshState();
    state.importInspection = null;
    showToast("Your color library was restored.");
    await renderBackup();
  } catch (error) {
    message.className = "alert alert-danger mt-3";
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Restore selected backup";
  }
}

function renderNotFound() {
  setActiveNavigation("");
  app.innerHTML = `<section class="page-shell"><div class="container text-center py-5"><p class="eyebrow">Nothing here</p><h1 class="page-title mx-auto">That color or batch could not be found.</h1><p class="page-intro mx-auto">It may have been removed from this device.</p><a class="btn btn-brand mt-4" href="#/library">Return to the color library</a></div></section>`;
}

function renderFatal(error) {
  app.innerHTML = `<section class="page-shell"><div class="container"><div class="alert alert-danger p-4"><h1 class="h4">Color Studio could not open its local library.</h1><p class="mb-0">${escapeHtml(error.message)}</p></div></div></section>`;
}

async function route() {
  releaseObjectUrls();
  const { segments, query } = routeInfo();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (!segments.length || segments[0] === "library") return renderLibrary();
  if (segments[0] === "color" && segments[1]) return renderColorDetail(segments[1]);
  if (segments[0] === "batch" && segments[1] === "new") return renderBatchBuilder(query.get("color"), query.get("adjust") === "1");
  if (segments[0] === "batch" && segments[1]) return renderBatchDetail(segments[1]);
  if (segments[0] === "materials") return renderMaterials();
  if (segments[0] === "backup") return renderBackup();
  return renderNotFound();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  const appRoot = new URL("../", import.meta.url);
  navigator.serviceWorker.register(new URL("sw.js", appRoot).href, { scope: appRoot.pathname })
    .then((registration) => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showToast("A fresh version is ready. Reopen the app when convenient.");
          }
        });
      });
    })
    .catch(() => {});
}

async function initialize() {
  try {
    await openDatabase();
    await ensureDefaultMaterials();
    await refreshState();
    window.addEventListener("hashchange", () => route().catch(renderFatal));
    await route();
    registerServiceWorker();
  } catch (error) {
    renderFatal(error);
  }
}

initialize();
