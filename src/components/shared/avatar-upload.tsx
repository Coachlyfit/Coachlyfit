"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const fileInput = useRef<HTMLInputElement>(null);

  const avatarSizes = { default: "size-16", sm: "size-10", lg: "size-20" } as const;

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

  const face = (
    <>
      <UserAvatar src={displayUrl ?? undefined} name={name} size={size} userId={userId} className={avatarSizes[size]} />
      {/* One small badge as the "this is editable" hint — it is part of the
          avatar's own button, not a second control. */}
      <span
        aria-hidden="true"
        className="absolute end-0 bottom-0 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
      </span>
    </>
  );
  const triggerClass =
    "relative inline-block rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-70";

  return (
    <div className="flex flex-col items-center gap-3">
      {/* The avatar is the control. No photo yet: tap to pick one. Has a
          photo: tap for Replace / Remove, so neither action needs its own
          badge covering the picture. */}
      {hasAvatar ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button type="button" disabled={pending} aria-label={t("edit")} className={triggerClass} />}
          >
            {face}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto min-w-40">
            <DropdownMenuItem onClick={() => fileInput.current?.click()}>
              <Camera className="size-4" aria-hidden="true" />
              {t("replace")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={handleRemove}>
              <Trash2 className="size-4" aria-hidden="true" />
              {t("remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          disabled={pending}
          aria-label={t("upload")}
          className={triggerClass}
          onClick={() => fileInput.current?.click()}
        >
          {face}
        </button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={handleChange}
        disabled={pending}
      />

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
