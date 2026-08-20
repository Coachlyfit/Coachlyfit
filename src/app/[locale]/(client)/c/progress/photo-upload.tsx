"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PROGRESS_BUCKET } from "@/domain/progress/progress.service";
import { addProgressPhotoAction } from "./actions";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "heic"]);

export function PhotoUpload({ locale, coachId, clientId }: { locale: string; coachId: string; clientId: string }) {
  const t = useTranslations("progress.photos");
  const tErrors = useTranslations("progress.errors");
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError(tErrors("invalid_file"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(tErrors("file_too_large"));
      return;
    }

    const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "";
    const ext = ALLOWED_EXT.has(rawExt) ? rawExt : "jpg";
    const path = `${coachId}/${clientId}/${crypto.randomUUID()}.${ext}`;

    setUploading(true);
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage.from(PROGRESS_BUCKET).upload(path, file);
    setUploading(false);

    if (uploadError) {
      setError(tErrors("upload_failed"));
      return;
    }

    startTransition(async () => {
      const result = await addProgressPhotoAction(locale, path);
      if (result?.error) setError(tErrors(result.error));
    });
  }

  const busy = uploading || pending;

  return (
    <div className="flex flex-col gap-2">
      <label className="flex h-11 w-fit min-w-44 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 text-sm text-muted-foreground hover:bg-muted">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
        {busy ? t("uploading") : t("add")}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleChange}
          disabled={busy}
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
