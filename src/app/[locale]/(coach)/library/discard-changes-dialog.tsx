"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** "Discard changes?" prompt shown over the exercise dialog. A second
 * Base UI dialog can't do this job: the exercise dialog is centered with a
 * CSS transform, which re-anchors any `fixed` descendant to the dialog box
 * (so the nested prompt sat inside it, unblurred, over the form text).
 * This is a plain overlay covering the dialog itself: blurs and dims the form
 * behind the card, moves focus to Cancel, and leaves Esc to the parent
 * dialog (which cancels this prompt while it's open). Render it inside the
 * dialog's content; the caller marks the form behind it `inert`. */
export function DiscardChangesDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("library.exercise.form.discard");
  const tCommon = useTranslations("common");
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10"
      >
        <div className="flex flex-col gap-2">
          <h2 id={titleId} className="text-base leading-none font-medium">
            {t("title")}
          </h2>
          <p id={descId} className="text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} type="button" variant="outline" onClick={onCancel} className="h-11">
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} className="h-11 min-w-24">
            {t("confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
