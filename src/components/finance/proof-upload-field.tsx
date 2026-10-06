"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Upload, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_PROOFS_BUCKET } from "@/domain/billing/client-billing.service";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

/** Optional proof-of-payment upload, shared by the two "record payment"
 * dialogs. Uploads straight to the private bucket under
 * `coachId/clientId/` (the prefix both the storage policy and the server
 * re-check) and hands the stored path back. */
export function ProofUploadField({
  coachId,
  clientId,
  path,
  onPathChange,
  onUploadingChange,
}: {
  coachId: string;
  clientId: string;
  path: string | null;
  onPathChange: (path: string | null) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const t = useTranslations("clients.billing.recordTransaction");
  const tErrors = useTranslations("clients.billing.errors");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);

    if (file.size > MAX_BYTES) {
      setError(tErrors("file_too_large"));
      return;
    }
    const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXT.has(rawExt)) {
      setError(tErrors("invalid_file"));
      return;
    }

    const nextPath = `${coachId}/${clientId}/${crypto.randomUUID()}.${rawExt}`;
    setUploading(true);
    onUploadingChange?.(true);
    const { error: uploadError } = await createClient().storage.from(PAYMENT_PROOFS_BUCKET).upload(nextPath, file);
    setUploading(false);
    onUploadingChange?.(false);

    if (uploadError) {
      setError(tErrors("upload_failed"));
      return;
    }
    onPathChange(nextPath);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{t("proof")}</Label>
      <label className="flex h-11 w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 text-sm text-muted-foreground hover:bg-muted">
        {path ? <Check className="size-4" /> : <Upload className="size-4" />}
        {path ? t("proofAttached") : uploading ? t("uploading") : t("proofUpload")}
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={handleChange}
          disabled={uploading}
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
