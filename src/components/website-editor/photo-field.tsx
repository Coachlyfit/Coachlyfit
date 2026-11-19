"use client";

import { useId, useRef, useState, useTransition, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicStorageUrl } from "@/domain/sites/public-site";
import { compressImage, MAX_IMAGE_BYTES } from "@/lib/compress-image";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const BUCKET = "coach-site";
const TYPES = ["image/jpeg", "image/png"];

/** Coach photo: drop zone, Replace and Remove. Uploads straight to the
 * coach-site bucket under the coach's own folder (storage RLS enforces that),
 * and reports the stored path; the path is what the draft keeps. */
export function PhotoField({
  coachId,
  path,
  onChange,
}: {
  coachId: string;
  path: string | null;
  onChange: (path: string | null) => void;
}) {
  const t = useTranslations("websiteEditor.form.about");
  const tErr = useTranslations("websiteEditor.errors");
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [pending, startTransition] = useTransition();

  const url = path ? publicStorageUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, BUCKET, path) : null;

  function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!TYPES.includes(file.type)) return setError(tErr("photoType"));
    if (file.size > MAX_IMAGE_BYTES) return setError(tErr("photoSize"));

    startTransition(async () => {
      const supabase = createClient();
      const blob = await compressImage(file);
      const ext = blob.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
      const next = `${coachId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(next, blob, { contentType: blob.type });
      if (upErr) return setError(tErr("uploadFailed"));
      // Old file is orphaned otherwise. Best effort: a leftover is harmless.
      if (path) await supabase.storage.from(BUCKET).remove([path]);
      onChange(next);
    });
  }

  function remove() {
    if (!path) return;
    const old = path;
    onChange(null);
    void createClient().storage.from(BUCKET).remove([old]);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(false);
    upload(e.dataTransfer.files[0]);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t("photo")}</span>
      <div className="flex items-center gap-3">
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={cn(
            "relative flex min-h-32 w-28 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-input text-muted-foreground focus-within:ring-3 focus-within:ring-ring/50",
            over && "border-primary bg-accent-tint",
            pending && "opacity-60"
          )}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote Supabase URL, no next/image config
            <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 px-2 text-center text-xs">
              <ImagePlus className="size-5" aria-hidden="true" />
              {pending ? t("uploading") : t("upload")}
            </span>
          )}
          <input
            ref={input}
            id={inputId}
            type="file"
            accept={TYPES.join(",")}
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
            aria-describedby={`${inputId}-hint`}
          />
        </label>
        <div className="flex flex-col items-start gap-1">
          {path && (
            <>
              <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={pending} onClick={() => input.current?.click()}>
                {pending ? t("uploading") : t("replace")}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="min-h-11 text-destructive" disabled={pending} onClick={remove}>
                {t("remove")}
              </Button>
            </>
          )}
        </div>
      </div>
      <p id={`${inputId}-hint`} className="text-sm text-muted-foreground">
        {t("uploadHint")}
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
