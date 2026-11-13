"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** "Discard changes?" confirm that opens ON TOP of the exercise dialog.
 * The shared ConfirmDialog paints its own blurred backdrop, which stacks on
 * the exercise dialog's one and smears the form behind it — so this one has
 * a transparent backdrop (still blocks clicks). Render it inside the parent
 * dialog's content so Base UI treats it as nested and keeps focus working. */
export function DiscardChangesDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("library.exercise.form.discard");
  const tCommon = useTranslations("common");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[60]" />
        <DialogPrimitive.Popup className="fixed inset-0 z-[60] m-auto flex h-fit w-[calc(100%-2rem)] max-w-sm flex-col gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <div className="flex flex-col gap-2">
            <DialogPrimitive.Title className="text-base leading-none font-medium">{t("title")}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {t("description")}
            </DialogPrimitive.Description>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogPrimitive.Close render={<Button type="button" variant="outline" className="h-11" />}>
              {tCommon("cancel")}
            </DialogPrimitive.Close>
            <Button type="button" variant="destructive" onClick={onConfirm} className="h-11 min-w-24">
              {t("confirm")}
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
