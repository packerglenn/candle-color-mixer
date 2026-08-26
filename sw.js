const CACHE_NAME = "candle-color-mixer-v1.0.7";
const APP_ROOT = new URL("./", self.location.href);
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./data/seed.json",
  "./src/app.js",
  "./src/data/css-named-colors.js",
  "./src/data/seed.js",
  "./src/domain/calculator.js",
  "./src/domain/color-science.js",
  "./src/domain/decimal.js",
  "./src/domain/errors.js",
  "./src/domain/formula-engine.js",
  "./src/domain/process-guidance.js",
  "./src/domain/scale-engine.js",
  "./src/domain/screen-color-name.js",
  "./src/domain/visual-formula.js"
].map((path) => new URL(path, APP_ROOT).href);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => event.request.mode === "navigate"
        ? caches.match(new URL("index.html", APP_ROOT).href)
        : caches.match(event.request)),
  );
});
