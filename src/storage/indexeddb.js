const DATABASE_NAME = "pinewood-blooms-color-studio";
const DATABASE_VERSION = 1;

export const STORE_NAMES = Object.freeze([
  "colors",
  "recipeVersions",
  "batches",
  "photos",
  "materials",
  "materialPrices",
  "settings",
]);

let databasePromise;

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("The local save was cancelled."));
  });
}

function createStore(database, name, options, indexes = []) {
  if (database.objectStoreNames.contains(name)) return;
  const store = database.createObjectStore(name, options);
  indexes.forEach(([indexName, keyPath, indexOptions]) => store.createIndex(indexName, keyPath, indexOptions));
}

export function openDatabase() {
  if (!("indexedDB" in globalThis)) {
    return Promise.reject(new Error("Local storage is unavailable in this browser."));
  }
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      createStore(database, "colors", { keyPath: "id" }, [
        ["archived", "archived", { unique: false }],
        ["modifiedUtc", "modifiedUtc", { unique: false }],
      ]);
      createStore(database, "recipeVersions", { keyPath: "id" }, [
        ["colorId", "colorId", { unique: false }],
      ]);
      createStore(database, "batches", { keyPath: "id" }, [
        ["colorId", "colorId", { unique: false }],
        ["createdUtc", "createdUtc", { unique: false }],
      ]);
      createStore(database, "photos", { keyPath: "id" }, [
        ["colorId", "colorId", { unique: false }],
        ["batchId", "batchId", { unique: false }],
      ]);
      createStore(database, "materials", { keyPath: "id" }, [
        ["category", "category", { unique: false }],
      ]);
      createStore(database, "materialPrices", { keyPath: "id" }, [
        ["materialId", "materialId", { unique: false }],
      ]);
      createStore(database, "settings", { keyPath: "key" });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other Color Studio tabs, then try again."));
  });
  return databasePromise;
}

export async function getRecord(storeName, key) {
  const database = await openDatabase();
  return requestPromise(database.transaction(storeName, "readonly").objectStore(storeName).get(key));
}

export async function getAllRecords(storeName) {
  const database = await openDatabase();
  return requestPromise(database.transaction(storeName, "readonly").objectStore(storeName).getAll());
}

export async function getAllByIndex(storeName, indexName, key) {
  const database = await openDatabase();
  return requestPromise(database.transaction(storeName, "readonly").objectStore(storeName).index(indexName).getAll(key));
}

export async function putRecord(storeName, value) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionPromise(transaction);
  return value;
}

export async function deleteRecord(storeName, key) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionPromise(transaction);
}

export async function getSetting(key, fallback = null) {
  return (await getRecord("settings", key))?.value ?? fallback;
}

export async function setSetting(key, value) {
  return putRecord("settings", { key, value, modifiedUtc: new Date().toISOString() });
}

export async function saveBatchBundle({ color, recipeVersion, batch, photos }) {
  const database = await openDatabase();
  const names = ["colors", "recipeVersions", "batches", "photos"].filter((name) => {
    if (name === "colors") return Boolean(color);
    if (name === "recipeVersions") return Boolean(recipeVersion);
    return true;
  });
  const transaction = database.transaction(names, "readwrite");
  if (color) transaction.objectStore("colors").put(color);
  if (recipeVersion) transaction.objectStore("recipeVersions").put(recipeVersion);
  transaction.objectStore("batches").put(batch);
  photos.forEach((photo) => transaction.objectStore("photos").put(photo));
  await transactionPromise(transaction);
}

export async function saveColorPhotos(color, photos) {
  const database = await openDatabase();
  const stores = color ? ["colors", "photos"] : ["photos"];
  const transaction = database.transaction(stores, "readwrite");
  if (color) transaction.objectStore("colors").put(color);
  photos.forEach((photo) => transaction.objectStore("photos").put(photo));
  await transactionPromise(transaction);
}

export async function saveMaterialAndPrice(material, priceVersion) {
  const database = await openDatabase();
  const transaction = database.transaction(["materials", "materialPrices"], "readwrite");
  transaction.objectStore("materials").put(material);
  transaction.objectStore("materialPrices").put(priceVersion);
  await transactionPromise(transaction);
}

export async function readDatabaseSnapshot() {
  const entries = await Promise.all(STORE_NAMES.map(async (name) => [name, await getAllRecords(name)]));
  return Object.fromEntries(entries);
}

export async function replaceDatabaseSnapshot(snapshot) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAMES, "readwrite");
  for (const name of STORE_NAMES) {
    const store = transaction.objectStore(name);
    store.clear();
    for (const record of snapshot[name] ?? []) store.put(record);
  }
  await transactionPromise(transaction);
}

export async function mergeDatabaseSnapshot(snapshot) {
  const database = await openDatabase();
  const conflicts = [];
  for (const name of STORE_NAMES) {
    const existing = await getAllRecords(name);
    const keyField = name === "settings" ? "key" : "id";
    const byKey = new Map(existing.map((record) => [record[keyField], record]));
    for (const incoming of snapshot[name] ?? []) {
      const current = byKey.get(incoming[keyField]);
      if (current && JSON.stringify(current) !== JSON.stringify(incoming)) {
        conflicts.push(`${name}:${incoming[keyField]}`);
      }
    }
  }
  if (conflicts.length) return { merged: false, conflicts };

  const transaction = database.transaction(STORE_NAMES, "readwrite");
  for (const name of STORE_NAMES) {
    const store = transaction.objectStore(name);
    for (const record of snapshot[name] ?? []) store.put(record);
  }
  await transactionPromise(transaction);
  return { merged: true, conflicts: [] };
}
