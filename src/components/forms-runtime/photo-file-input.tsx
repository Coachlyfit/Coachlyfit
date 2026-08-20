"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Paperclip, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Reuses the progress-media bucket from Phase 1 (private, path-scoped by
// `${coachId}/${clientId}/...` per its storage policies) rather than
// standing up a second bucket for form attachments.

/** Shared by the classic file picker below and the step-flow camera capture
 * — one upload path so the bucket key format only has to be right once. */
export function useMediaUpload(uploadContext?: { coachId: string; clientId: string }) {
  const [uploading, setUploading] = useState(false);

  async function upload(file: File): Promise<string | undefined> {
    if (!uploadContext) return undefined;
    setUploading(true);
    const supabase = createClient();
    const path = `${uploadContext.coachId}/${uploadContext.clientId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("progress-media").upload(path, file);
    setUploading(false);
    return error ? undefined : path;
  }

  return { upload, uploading };
}

export function PhotoFileInput({
  value,
  onChange,
  accept,
  uploadContext,
}: {
  value: string | undefined;
  onChange: (path: string | undefined) => void;
  accept?: string;
  uploadContext?: { coachId: string; clientId: string };
}) {
  const t = useTranslations("forms.fill");
  const { upload, uploading } = useMediaUpload(uploadContext);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const path = await upload(file);
    if (path) onChange(path);
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Paperclip className="size-4 text-muted-foreground" />
        <span className="truncate">{value.split("/").pop()}</span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(undefined)}>
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
      {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
      {t("chooseFile")}
      <input type="file" accept={accept} className="hidden" onChange={handleChange} disabled={uploading} />
    </label>
  );
}
