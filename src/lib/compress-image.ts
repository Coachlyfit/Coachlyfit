export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Checks a picked photo before any work is done on it; returns an error key
 * (`image_type` / `image_too_large`) or null. */
export function imageFileError(file: File): "image_type" | "image_too_large" | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "image_type";
  if (file.size > MAX_IMAGE_BYTES) return "image_too_large";
  return null;
}

/** Downscales to at most `maxSide` px on the long edge and re-encodes as
 * WebP, so a 4 MB phone photo uploads as a few hundred KB. Falls back to the
 * original file if the browser can't decode or encode it. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    return blob && blob.type === "image/webp" ? blob : file;
  } catch {
    return file;
  }
}
