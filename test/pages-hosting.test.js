import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("HTML assets remain relative for GitHub Pages project sites", () => {
  const html = read("index.html");
  assert.doesNotMatch(html, /(?:href|src)="\/(?!\/)/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/src\/app\.js"/);
  assert.match(html, /id="dye-load"[^>]+type="hidden"[^>]+value="0\.50"/);
  assert.doesNotMatch(html, /Transcribed soy guidance/);
});

test("the web manifest is scoped to its deployment directory", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.ok(manifest.icons.every((icon) => icon.src.startsWith("./")));
});

test("the service worker derives cached URLs from its own Pages scope", () => {
  const worker = read("sw.js");
  assert.match(worker, /const APP_ROOT = new URL\("\.\/", self\.location\.href\)/);
  assert.match(worker, /"\.\/src\/domain\/fragrance\.js"/);
  assert.doesNotMatch(worker, /^\s*"\//m);
});

test("the repository contains an official Pages deployment workflow", () => {
  const workflow = read(".github/workflows/deploy-pages.yml");
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
