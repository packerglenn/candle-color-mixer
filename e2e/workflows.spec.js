import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/#/library");
  await expect(page.getByRole("heading", { name: /Build a color library/i })).toBeVisible();
});

test("wax selection updates the kit-based dye strengths and keeps the color wheel", async ({ page }) => {
  await expect(page.locator("#starter-colors .library-card")).toHaveCount(6);
  await expect(page.getByText("Made for decorative molded wax.")).toBeVisible();

  await page.getByRole("link", { name: /Create a new color/i }).click();
  await expect(page.locator("#color-wheel")).toBeVisible();
  await expect(page.locator("#wax-type option")).toHaveText([
    "Paraffin wax",
    "Soy wax",
    "Beeswax",
    "Palm wax",
  ]);
  await expect(page.locator("#wax-type")).toHaveValue("paraffin");
  await expect(page.locator("#dye-load option")).toHaveText([
    "High · 0.10 oz per 2.2 lb",
    "Midpoint · 0.085 oz per 2.2 lb",
    "Low · 0.07 oz per 2.2 lb",
  ]);
  await expect(page.locator("#dye-load")).toHaveValue("0.284090909090909090909091");
  await expect(page.getByText(/kit recommends 0\.07–0\.10 oz of dye by weight for 2\.2 lb of paraffin wax/i)).toBeVisible();

  await page.locator("#wax-type").selectOption("soy");
  await expect(page.locator("#dye-load option")).toHaveText([
    "High · 0.20 oz per 2.2 lb",
    "Midpoint · 0.14 oz per 2.2 lb",
    "Low · 0.08 oz per 2.2 lb",
  ]);
  await expect(page.locator("#dye-load")).toHaveValue("0.568181818181818181818182");
  await expect(page.getByText(/kit recommends 0\.08–0\.20 oz of dye by weight for 2\.2 lb of soy wax/i)).toBeVisible();
  await page.getByRole("button", { name: /Calculate Color Plan/i }).click();
  await expect(page.locator(".summary-strip")).toContainText("0.568 g");
  await expect(page.locator(".production-table tbody tr").first()).toContainText("Soy wax");

  await page.locator("#wax-type").selectOption("paraffin");
  await expect(page.locator("#batch-result")).toBeEmpty();

  await page.getByRole("button", { name: /Calculate Color Plan/i }).click();
  await expect(page.getByRole("heading", { name: "Weigh each ingredient" })).toBeVisible();
  await expect(page.locator(".summary-strip")).toContainText("0.284 g");
  await expect(page.locator(".result-card .alert-warning")).toHaveCount(0);
  await expect(page.getByText(/unverified manufacturer transcription/i)).toHaveCount(0);
});

test("phone layouts stay within the viewport and keep formula controls usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Phone-only responsive regression");

  for (const route of ["library", "materials", "backup", "batch/new"]) {
    await page.goto(`/#/${route}`);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  }

  const formulaRows = await page.locator(".formula-editor-row").evaluateAll((rows) => rows.map((row) => {
    const rowRect = row.getBoundingClientRect();
    const amountRect = row.querySelector(".input-group").getBoundingClientRect();
    return {
      left: rowRect.left,
      right: rowRect.right,
      amountWidth: amountRect.width,
      viewport: document.documentElement.clientWidth,
    };
  }));
  expect(formulaRows.every((row) => row.left >= 0 && row.right <= row.viewport && row.amountWidth >= 180)).toBe(true);

  await page.getByRole("button", { name: /Calculate Color Plan/i }).click();
  await expect(page.locator(".production-table tbody tr").first()).toHaveCSS("display", "grid");
});

test("calculation validation highlights the fields that need attention", async ({ page }) => {
  await page.goto("/#/batch/new");
  await page.locator("#base-wax").fill("0");
  await page.getByRole("button", { name: /Calculate Color Plan/i }).click();
  await expect(page.locator("#base-wax")).toHaveClass(/is-invalid/);
  await expect(page.locator("#base-wax")).toBeFocused();

  await page.locator("#base-wax").fill("100");
  await page.locator(".component-percent").first().fill("69");
  await page.getByRole("button", { name: /Calculate Color Plan/i }).click();
  await expect(page.locator(".component-percent.is-invalid")).toHaveCount(3);
  await expect(page.locator("#batch-error")).toContainText("total exactly 100%");

  await page.locator(".component-percent").first().fill("70");
  await page.getByRole("button", { name: /Calculate Color Plan/i }).click();
  await expect(page.getByRole("heading", { name: "Weigh each ingredient" })).toBeVisible();
});

test("a saved color remembers its wax type", async ({ page }) => {
  await page.goto("/#/batch/new");
  await page.locator("#color-name").fill("E2E Beeswax Color");
  await page.locator("#wax-type").selectOption("beeswax");
  await page.getByRole("button", { name: /Calculate Color Plan/i }).click();
  await page.locator("#save-batch").click();

  await expect(page.getByRole("heading", { name: "E2E Beeswax Color" })).toBeVisible();
  await expect(page.getByText("Built for Beeswax")).toBeVisible();
  await page.getByRole("link", { name: "Create another batch" }).click();
  await expect(page.locator("#wax-type")).toHaveValue("beeswax");
  await expect(page.locator("#dye-load")).toHaveValue("0.568");
});

test("a maker can change actual amounts, attach a photo, and save a reusable color", async ({ page }, testInfo) => {
  await page.goto("/#/batch/new");
  await page.locator("#color-name").fill("E2E Garden Rose");
  await page.getByRole("button", { name: /Calculate Color Plan/i }).click();
  await expect(page.locator("#actual-dye-candle-shop-red")).toBeVisible();

  await page.locator("#actual-dye-candle-shop-red").fill("0.219");
  await page.locator("#photo-stage").selectOption("cured");
  const samplePhoto = testInfo.outputPath("wax-sample.png");
  await page.locator("#wheel-selected-swatch").screenshot({ path: samplePhoto });
  await page.locator("#gallery-photos").setInputFiles(samplePhoto);
  await expect(page.locator("#pending-photos figure")).toHaveCount(1);

  await page.locator("#save-batch").click();
  await expect(page).toHaveURL(/#\/color\/color-/);
  await expect(page.getByRole("heading", { name: "E2E Garden Rose" })).toBeVisible();
  await expect(page.getByText("0.304% dye load")).toBeVisible();
  await expect(page.getByText("Built for Paraffin wax")).toBeVisible();
  await expect(page.locator(".photo-gallery figure")).toHaveCount(1);

  await page.getByRole("link", { name: "Adjust formula" }).click();
  await page.getByRole("button", { name: /Calculate Color Plan/i }).click();
  await page.locator("#actual-dye-candle-shop-red").fill("0.230");
  await page.getByText("Save as the next version").click();
  await page.locator("#save-batch").click();
  await expect(page.getByRole("heading", { name: "Version 2" })).toBeVisible();
});

test("material pricing flows into batch cost and the local library can be backed up and restored", async ({ page }, testInfo) => {
  await page.goto("/#/materials");

  const savePrice = async (materialId, price, quantity, unit) => {
    await page.locator("#price-material").selectOption(materialId);
    await page.locator("#purchase-price").fill(price);
    await page.locator("#purchase-quantity").fill(quantity);
    await page.locator("#purchase-unit").selectOption(unit);
    await page.getByRole("button", { name: "Save material price" }).click();
    await expect(page.getByText(`$${Number(price).toFixed(2)}`, { exact: true })).toBeVisible();
  };

  await savePrice("paraffin-wax", "25", "10", "lb");
  await savePrice("dye-default", "18", "100", "g");

  await page.goto("/#/batch/new");
  await page.locator("#color-name").fill("E2E Costed Color");
  await page.getByRole("button", { name: /Calculate Color Plan/i }).click();
  await expect(page.locator("#cost-preview")).toContainText("Every ingredient has a saved price");
  await page.locator("#save-batch").click();
  await expect(page).toHaveURL(/#\/color\/color-/);

  await page.goto("/#/backup");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-backup").click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath("wax-color-studio.ccm-backup.json");
  await download.saveAs(backupPath);

  await page.locator("#backup-file").setInputFiles(backupPath);
  await expect(page.locator("#restore-message")).toContainText("Ready to restore: 1 colors, 1 batches");
  await page.locator("input[name='restore-mode'][value='replace']").check();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#restore-backup").click();
  await expect(page.locator("#app-toast .toast-body")).toContainText("Your color library was restored");
});
