"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { MARKETING_BUCKET, marketingImageUrl } from "@/components/marketing/section-view";

const MAX_BYTES = 2 * 1024 * 1024;

/** Uploads straight from the browser with the admin's own session; the
 * bucket's policies are what stop anyone else. A replaced or removed file is
 * left in the bucket on purpose: an older published version may still show it. */
export function ImageField({
  folder,
  path,
  onChange,
}: {
  folder: string;
  path: string | undefined;
  onChange: (path: string | undefined) => void;
}) {
  const t = useTranslations("admin.site");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const url = marketingImageUrl(path);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error(t("errors.file_too_large"));
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "img";
    const next = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient().storage.from(MARKETING_BUCKET).upload(next, file);
    setUploading(false);
    if (error) {
      toast.error(t("errors.upload_failed"));
      return;
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium">{t("inspector.image")}</span>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- public storage URL, arbitrary aspect ratio
        <img src={url} alt="" className="max-h-40 w-full rounded-[10px] object-contain ring-1 ring-border" />
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="sr-only"
        aria-label={t("inspector.image")}
        tabIndex={-1}
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? t("inspector.uploading") : t(url ? "inspector.replaceImage" : "inspector.uploadImage")}
        </Button>
        {url && (
          <Button type="button" variant="ghost" disabled={uploading} onClick={() => onChange(undefined)}>
            {t("inspector.removeImage")}
          </Button>
        )}
      </div>
      <span className="text-xs text-muted-foreground">{t("inspector.imageHint")}</span>
    </div>
  );
}
