"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "./user-avatar";
import { uploadAvatarAction, removeAvatarAction } from "@/app/[locale]/(coach)/settings/avatar-actions";

/** Editable avatar: a polished circular photo with an inline upload button,
 * instant preview, loading state, and a remove option. Validates image type
 * and the 2 MB cap client-side as a courtesy; the server action re-validates,
 * so a malicious or non-browser caller can't bypass it. */
export function AvatarUpload({
  userId,
  name,
  src,
  size = "default",
  locale,
}: {
  userId: string;
  name: string;
  /** Public avatar URL, or null when none is set. */
  src: string | null;
  size?: "default" | "sm" | "lg";
  locale: string;
}) {
  const t = useTranslations("common.avatar");
  const tErrors = useTranslations("settings.errors");
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  const avatarSizes = { default: "size-16", sm: "size-10", lg: "size-20" };

  const clearPreview = useCallback(() => {
    setPreview(null);
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  }, []);

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      setError(null);

      // Client-side courtesy check (re-validated server-side).
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const validExt = new Set(["jpg", "jpeg", "png", "webp"]);
      if (!validExt.has(ext) || file.size > 2 * 1024 * 1024) {
        setError(tErrors("invalid_file"));
        return;
      }

      const url = URL.createObjectURL(file);
      objectUrl.current = url;
      setPreview(url);

      const formData = new FormData();
      formData.set("avatar", file);

      startTransition(async () => {
        const result = await uploadAvatarAction(locale, formData);
        if ("error" in result) {
          setError(result.error);
          clearPreview();
          toast.error(tErrors(result.error));
          return;
        }
        toast.success(t("uploaded"));
      });
    },
    [locale, t, tErrors, clearPreview],
  );

  const handleRemove = useCallback(async () => {
    setError(null);
    startTransition(async () => {
      const result = await removeAvatarAction(locale);
      if ("error" in result) {
        setError(result.error);
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(t("removed"));
    });
  }, [locale, t, tErrors]);

  const displayUrl = preview ?? src;
  const hasAvatar = !!displayUrl;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative inline-block">
        <UserAvatar src={displayUrl ?? undefined} name={name} size={size} userId={userId} />

        <div className="absolute end-0 bottom-0 z-20 flex flex-col items-end gap-1">
          {hasAvatar && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={pending}
              aria-label={t("remove")}
              className="flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground ring-2 ring-background hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-3" aria-hidden="true" />
            </button>
          )}
          <label
            className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={hasAvatar ? t("replace") : t("upload")}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin text-white" aria-hidden="true" />
            ) : (
              <Upload className="size-3.5" aria-hidden="true" />
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={handleChange}
              disabled={pending}
            />
          </label>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive text-start w-full">{error}</p>
      )}
      {preview && !pending && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearPreview}
          className="w-full text-start"
          disabled={pending}
        >
          {t("replace")}
        </Button>
      )}
    </div>
  );
}
