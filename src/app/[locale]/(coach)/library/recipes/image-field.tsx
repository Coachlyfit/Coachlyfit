"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChefHat, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { compressImage, imageFileError, IMAGE_TYPES } from "@/lib/compress-image";
import { RECIPE_IMAGES_BUCKET } from "@/domain/recipes/recipes.service";

/** Optional recipe photo. Compressed in the browser, then uploaded straight
 * to the private bucket under the coach's folder (the storage policies
 * only allow that folder). The form only holds the storage path; replacing
 * the saved image is cleaned up server-side on save, and a photo uploaded
 * but replaced again before saving is removed here.
 * ponytail: a photo uploaded on a form that is then abandoned stays in the
 * bucket; sweep orphans (paths no recipe references) if storage matters. */
export function ImageField({
  coachId,
  value,
  savedPath,
  initialUrl,
  onChange,
}: {
  coachId: string;
  value: string;
  /** The path saved on the recipe; never deleted from here. */
  savedPath: string | null;
  initialUrl: string | null;
  onChange: (path: string) => void;
}) {
  const t = useTranslations("recipes.form");
  const tErrors = useTranslations("recipes.errors");
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(value ? initialUrl : null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function discardUnsaved(path: string) {
    if (path && path !== savedPath) void createClient().storage.from(RECIPE_IMAGES_BUCKET).remove([path]);
  }

  async function pick(file: File) {
    setError(null);
    const invalid = imageFileError(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setUploading(true);
    try {
      const blob = await compressImage(file);
      const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
      const path = `${coachId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await createClient()
        .storage.from(RECIPE_IMAGES_BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: false });
      if (uploadError) {
        setError("upload_failed");
        return;
      }
      discardUnsaved(value);
      setPreview(URL.createObjectURL(blob));
      onChange(path);
    } catch {
      setError("upload_failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="flex aspect-video w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- object URL or short-lived signed URL
            <img src={preview} alt={t("imageAlt")} className="size-full object-cover" />
          ) : (
            <ChefHat className="size-8 text-muted-foreground/50" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <input
            ref={inputRef}
            id="recipe-image"
            type="file"
            accept={IMAGE_TYPES.join(",")}
            className="sr-only"
            aria-describedby="recipe-image-hint"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void pick(file);
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-4" aria-hidden="true" />}
            {uploading ? t("imageUploading") : value ? t("imageReplace") : t("imageChoose")}
          </Button>
          {value && !uploading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                discardUnsaved(value);
                setPreview(null);
                onChange("");
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {t("imageRemove")}
            </Button>
          )}
        </div>
      </div>
      <p id="recipe-image-hint" className="text-xs text-muted-foreground">
        {t("imageHint")}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {tErrors(error)}
        </p>
      )}
    </div>
  );
}
