import {
  mergeDatabaseSnapshot,
  readDatabaseSnapshot,
  replaceDatabaseSnapshot,
  setSetting,
  STORE_NAMES,
} from "./storage/indexeddb.js";
import { blobToDataUrl, dataUrlToBlob, sha256 } from "./media/photos.js";

const BACKUP_FORMAT = "pinewood-blooms-color-studio";
const BACKUP_VERSION = 1;

export async function createBackup() {
  const snapshot = await readDatabaseSnapshot();
  snapshot.settings = snapshot.settings.filter((record) => record.key !== "lastBackupUtc");
  snapshot.photos = await Promise.all(snapshot.photos.map(async (photo) => ({
    ...photo,
    imageBlob: await blobToDataUrl(photo.imageBlob),
    thumbnailBlob: await blobToDataUrl(photo.thumbnailBlob),
  })));
  const exportedUtc = new Date().toISOString();
  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    applicationVersion: "2.0.0",
    exportedUtc,
    manifest: Object.fromEntries(STORE_NAMES.map((name) => [name, snapshot[name].length])),
    stores: snapshot,
  };
}

export async function downloadBackup() {
  const backup = await createBackup();
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pinewood-color-studio-${backup.exportedUtc.slice(0, 10)}.ccm-backup.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  await setSetting("lastBackupUtc", backup.exportedUtc);
  return backup;
}

async function validateAndHydrate(payload) {
  if (payload?.format !== BACKUP_FORMAT || payload?.backupVersion !== BACKUP_VERSION) {
    throw new Error("This is not a supported Wax Color Studio backup.");
  }
  if (!payload.stores || typeof payload.stores !== "object") {
    throw new Error("The backup does not contain a data snapshot.");
  }
  for (const name of STORE_NAMES) {
    if (!Array.isArray(payload.stores[name])) throw new Error(`The backup is missing ${name} records.`);
    if (payload.manifest?.[name] !== payload.stores[name].length) {
      throw new Error(`The ${name} record count does not match the backup manifest.`);
    }
  }
  const snapshot = structuredClone(payload.stores);
  snapshot.photos = await Promise.all(snapshot.photos.map(async (photo) => {
    const imageBlob = dataUrlToBlob(photo.imageBlob);
    const thumbnailBlob = dataUrlToBlob(photo.thumbnailBlob);
    if (await sha256(imageBlob) !== photo.sha256) {
      throw new Error(`Photo integrity check failed for ${photo.fileName ?? photo.id}.`);
    }
    return { ...photo, imageBlob, thumbnailBlob };
  }));
  return { snapshot, payload };
}

export async function inspectBackupFile(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  return validateAndHydrate(payload);
}

export async function restoreBackup(file, mode) {
  const { snapshot, payload } = await inspectBackupFile(file);
  if (mode === "replace") {
    await replaceDatabaseSnapshot(snapshot);
    return { restored: true, conflicts: [], payload };
  }
  const result = await mergeDatabaseSnapshot(snapshot);
  return { restored: result.merged, conflicts: result.conflicts, payload };
}
