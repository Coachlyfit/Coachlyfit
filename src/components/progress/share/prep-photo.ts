const MAX_SIDE = 1600;
/** Share of the photo height, from the top, that "Blur face" covers. Fixed on
 * purpose: there is no face detection, so this errs on the side of covering
 * more. */
const BLUR_BAND = 0.3;

export async function fetchPhotoBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo_fetch_${res.status}`);
  return res.blob();
}

/** Smooth downscale-then-upscale of the top band, baked into the pixels. Done
 * with plain drawImage (not ctx.filter) so it works in Safari, and so the
 * preview and the exported PNG are the same pixels. */
function blurTopBand(ctx: CanvasRenderingContext2D, width: number, bandHeight: number) {
  const make = (w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    return c;
  };
  const tiny = make(Math.round(width / 28), Math.round(bandHeight / 28));
  const mid = make(tiny.width * 4, tiny.height * 4);
  const tctx = tiny.getContext("2d");
  const mctx = mid.getContext("2d");
  if (!tctx || !mctx) return;
  for (const c of [tctx, mctx, ctx]) {
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
  }
  tctx.drawImage(ctx.canvas, 0, 0, width, bandHeight, 0, 0, tiny.width, tiny.height);
  mctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, 0, 0, mid.width, mid.height);
  ctx.drawImage(mid, 0, 0, mid.width, mid.height, 0, 0, width, bandHeight);
}

/** Decodes (honouring EXIF rotation), caps the size, optionally blurs the top
 * band, and returns an object URL. Same-origin, so the export never hits a
 * cross-origin canvas. The caller revokes the URL. */
export async function renderPhoto(blob: Blob, blurTop: boolean): Promise<string> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (blurTop) blurTopBand(ctx, canvas.width, Math.round(canvas.height * BLUR_BAND));

    const out = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), "image/jpeg", 0.92)
    );
    return URL.createObjectURL(out);
  } finally {
    bitmap.close();
  }
}
