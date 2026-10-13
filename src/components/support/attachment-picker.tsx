"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ATTACHMENT_EXT_BY_MIME,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
  SUPPORT_BUCKET,
  isAttachmentMime,
} from "@/domain/support/support";

export type PickedAttachment = { path: string; preview: string };

/** Image attachments for one ticket message. Each file goes straight to the
 * private bucket under `folder` (the message's own `coach/ticket/message/`,
 * the prefix the storage policy and the database both check) as soon as it is
 * picked; the parent sends the stored paths with the message.
 *
 * Removing one only drops it from the message: files are immutable in the
 * bucket, so an unsent upload stays there unreferenced. */
export function AttachmentPicker({
  folder,
  value,
  onChange,
  onUploadingChange,
  disabled,
}: {
  folder: string;
  value: PickedAttachment[];
  onChange: (next: PickedAttachment[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("support.form");
  const tThread = useTranslations("support.thread");
  const tErrors = useTranslations("support.errors");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);

    if (value.length + files.length > MAX_ATTACHMENTS) {
      setError(tErrors("too_many_files", { max: MAX_ATTACHMENTS }));
      return;
    }
    if (files.some((file) => !isAttachmentMime(file.type))) {
      setError(tErrors("invalid_file"));
      return;
    }
    if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
      setError(tErrors("file_too_large", { size: MAX_ATTACHMENT_MB }));
      return;
    }

    setUploading(true);
    onUploadingChange?.(true);
    const storage = createClient().storage.from(SUPPORT_BUCKET);
    const added: PickedAttachment[] = [];
    let failed = false;
    for (const file of files) {
      const ext = ATTACHMENT_EXT_BY_MIME[file.type as keyof typeof ATTACHMENT_EXT_BY_MIME];
      const path = `${folder}${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await storage.upload(path, file, { contentType: file.type });
      if (uploadError) failed = true;
      else added.push({ path, preview: URL.createObjectURL(file) });
    }
    setUploading(false);
    onUploadingChange?.(false);

    if (failed) setError(tErrors("upload_failed"));
    if (added.length > 0) onChange([...value, ...added]);
  }

  function remove(path: string) {
    const target = value.find((item) => item.path === path);
    if (target) URL.revokeObjectURL(target.preview);
    onChange(value.filter((item) => item.path !== path));
  }

  const full = value.length >= MAX_ATTACHMENTS;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {value.map((item, index) => (
          <span key={item.path} className="relative">
            <img
              src={item.preview}
              alt={tThread("attachmentAlt", { index: index + 1 })}
              className="size-16 rounded-md border border-border object-cover"
            />
            <button
              type="button"
              onClick={() => remove(item.path)}
              disabled={disabled}
              aria-label={t("removeImage")}
              className="absolute -end-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        {!full && (
          <label className="flex h-11 w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 text-sm text-muted-foreground hover:bg-muted has-disabled:cursor-not-allowed has-disabled:opacity-60">
            <ImagePlus className="size-4" aria-hidden="true" />
            {uploading ? t("uploading") : t("addImage")}
            <input
              type="file"
              accept={Object.keys(ATTACHMENT_EXT_BY_MIME).join(",")}
              multiple
              className="hidden"
              onChange={handleChange}
              disabled={disabled || uploading}
            />
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("attachmentsHint", { max: MAX_ATTACHMENTS, size: MAX_ATTACHMENT_MB })}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
