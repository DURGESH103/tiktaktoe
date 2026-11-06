"use client";

import { fitWithin, MAX_PHOTO_BYTES } from "./memories";

/**
 * Shrinks a picked photo on the phone before upload: longest side ≤ 1600px, JPEG, stepping the
 * quality down until it's under 2 MB. Returns null if it can't get there (or isn't an image).
 * Re-encoding also drops EXIF data such as GPS location.
 */
export async function preparePhoto(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("image/")) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null; // e.g. HEIC on browsers that can't decode it
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.85, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (blob && blob.size <= MAX_PHOTO_BYTES) return blob;
  }
  return null;
}
