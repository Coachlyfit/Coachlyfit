"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ATTACHMENT_EXT_BY_MIME,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
  isAttachmentMime,
} from "@/domain/support/support";
import { FEEDBACK_BUCKET } from "@/domain/feedback/feedback";

export type PickedScreenshot = { path: string; preview: string };

/** One optional image for a feedback. It goes straight to the private bucket
 * under `folder` (`author/feedback/`, the prefix the storage policy and the
 * database both check) as soon as it is picked; the parent sends the stored
 * path with the feedback.
 *
 * Removing it only drops it from the feedback: files are immutable in the
 * bucket, so an unsent upload stays there unreferenced (same trade-off as the
 * support attachments). */
export function ScreenshotPicker({
  folder,
  value,
  onChange,
  onUploadingChange,
  disabled,
}: {
  folder: string;
  value: PickedScreenshot | null;
  onChange: (next: PickedScreenshot | null) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("feedback.screenshot");
  const tErrors = useTranslations("feedback.errors");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Release the preview's object URL when it is replaced or the form closes.
  useEffect(() => {
    const preview = value?.preview;
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [value?.preview]);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    if (!isAttachmentMime(file.type)) {
      setError(tErrors("invalid_file"));
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(tErrors("file_too_large", { size: MAX_ATTACHMENT_MB }));
      return;
    }

    setUploading(true);
    onUploadingChange?.(true);
    const path = `${folder}${crypto.randomUUID()}.${ATTACHMENT_EXT_BY_MIME[file.type]}`;
    const { error: uploadError } = await createClient()
      .storage.from(FEEDBACK_BUCKET)
      .upload(path, file, { contentType: file.type });
    setUploading(false);
    onUploadingChange?.(false);

    if (uploadError) {
      setError(tErrors("upload_failed"));
      return;
    }
    onChange({ path, preview: URL.createObjectURL(file) });
  }

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <span className="relative w-fit">
          <img src={value.preview} alt={t("alt")} className="size-20 rounded-md border border-border object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label={t("remove")}
            className="absolute -end-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </span>
      ) : (
        <label className="flex h-11 w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 text-sm text-muted-foreground hover:bg-muted has-disabled:cursor-not-allowed has-disabled:opacity-60">
          <ImagePlus className="size-4" aria-hidden="true" />
          {uploading ? t("uploading") : t("add")}
          <input
            type="file"
            accept={Object.keys(ATTACHMENT_EXT_BY_MIME).join(",")}
            className="hidden"
            onChange={handleChange}
            disabled={disabled || uploading}
          />
        </label>
      )}
      <p className="text-xs text-muted-foreground">{t("hint", { size: MAX_ATTACHMENT_MB })}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
