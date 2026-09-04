import { createId } from "../domain/library.js";

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The photo could not be prepared."));
    }, type, quality);
  });
}

async function decodeImage(file) {
  if ("createImageBitmap" in globalThis) {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function resize(image, maxEdge, quality) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return {
    blob: await canvasBlob(canvas, "image/jpeg", quality),
    width,
    height,
  };
}

export async function preparePhoto(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Choose a photo smaller than 25 MB.");
  const image = await decodeImage(file);
  try {
    const [display, thumbnail] = await Promise.all([
      resize(image, 1800, 0.88),
      resize(image, 640, 0.82),
    ]);
    const digest = await sha256(display.blob);
    return {
      id: createId("photo"),
      fileName: file.name || "candle-color.jpg",
      originalType: file.type,
      type: "image/jpeg",
      size: display.blob.size,
      width: display.width,
      height: display.height,
      sha256: digest,
      imageBlob: display.blob,
      thumbnailBlob: thumbnail.blob,
      createdUtc: new Date().toISOString(),
    };
  } finally {
    image.close?.();
  }
}

export async function sha256(blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(",");
  const type = /^data:([^;]+)/.exec(header)?.[1] ?? "application/octet-stream";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}
