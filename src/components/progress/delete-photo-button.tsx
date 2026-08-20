"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteMediaAction } from "@/app/[locale]/(coach)/clients/actions";

/** Coach-only delete (see coach_delete policy, 20260810000001_media_coach_delete.sql).
 * Absolutely positioned over PhotoTimeline's figure so it doesn't disturb
 * the grid layout — only rendered there when `canDelete` is true (the
 * client's own photo view never gets this button). */
export function DeletePhotoButton({
  locale,
  clientId,
  mediaId,
}: {
  locale: string;
  clientId: string;
  mediaId: string;
}) {
  const t = useTranslations("progress.photos");
  const tErrors = useTranslations("clients.errors");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const result = await deleteMediaAction(locale, clientId, mediaId);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(t("deleted"));
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("delete")}
        className="absolute end-1 top-1 flex size-6 items-center justify-center rounded-full bg-background/80 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("deleteConfirmTitle")}
        description={t("deleteConfirmBody")}
        confirmLabel={t("delete")}
        onConfirm={onConfirm}
        pending={pending}
      />
    </>
  );
}
