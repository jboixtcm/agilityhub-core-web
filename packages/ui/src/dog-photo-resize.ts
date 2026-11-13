/** WEB-05 (decision of 13-11-2026): the longest side a dog photo keeps when it is uploaded. */
export const DOG_PHOTO_MAX_EDGE_PX = 1600;

/** The encoder's quality for the reduced photo (0–1). */
const DOG_PHOTO_QUALITY = 0.85;

/** The canvas encoded as `type`, or `null` when this browser does not encode it (it falls back). */
function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob !== null && blob.type === type ? blob : null);
      },
      type,
      DOG_PHOTO_QUALITY,
    );
  });
}

/** The file's name with the extension of its new type («IMG_0042.HEIC» → «IMG_0042.webp»). */
function renamed(name: string, type: string): string {
  const extension = type === "image/webp" ? "webp" : "jpg";
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.${extension}`;
}

/**
 * A dog photo as it is uploaded (WEB-05; S03 §3 `photoFileKey`): a picture whose longest side is
 * over 1600 px is redrawn at 1600 px, upright as the camera took it, and encoded as WebP where the
 * browser can, else JPEG. A smaller picture, a file that is not an image or one this browser cannot
 * decode is uploaded as it is: the api still checks its type and `files.dogPhotoMaxMb`.
 */
export async function resizeDogPhoto(
  file: File,
  maxEdge: number = DOG_PHOTO_MAX_EDGE_PX,
): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= maxEdge) return file;
    const scale = maxEdge / longest;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) return file;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = (await encode(canvas, "image/webp")) ?? (await encode(canvas, "image/jpeg"));
    if (blob === null) return file;
    return new File([blob], renamed(file.name, blob.type), {
      lastModified: file.lastModified,
      type: blob.type,
    });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
