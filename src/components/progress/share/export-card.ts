import { domToBlob } from "modern-screenshot";

const isSafari = () => /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

/** Renders the card root to a PNG at its natural size. The element passed in
 * is the card itself, not the scaled preview wrapper around it, so the
 * wrapper's transform never reaches the clone. */
export async function renderCardPng(el: HTMLElement, width: number, height: number): Promise<Blob> {
  await document.fonts.ready;
  const options = { width, height, scale: 1, type: "image/png", style: { transform: "none" } } as const;
  // Safari decodes images lazily and drops them from the first capture.
  if (isSafari()) await domToBlob(el, options);
  const blob = await domToBlob(el, options);
  if (!blob) throw new Error("render_failed");
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type ShareResult = "shared" | "downloaded" | "cancelled";

/** Share the PNG through the OS sheet when the browser can share files, else
 * download it. Dismissing the sheet is not an error. */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<ShareResult> {
  const file = new File([blob], filename, { type: "image/png" });
  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Any other share failure: fall back to a plain download.
    }
  }
  downloadBlob(blob, filename);
  return "downloaded";
}
