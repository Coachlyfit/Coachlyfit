"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { customizePlatformTemplateAction, resetPlatformCopyAction } from "../actions";

/** Error code -> message: the library's own text for "template gone", the
 * programs-wide table for the rest, and a generic fallback for anything new. */
function useErrorMessage() {
  const tLib = useTranslations("programs.library.errors");
  const tErrors = useTranslations("programs.errors");
  return (code: string) => (code === "not_found_or_forbidden" ? tLib(code) : tErrors.has(code) ? tErrors(code) : tErrors("unknown"));
}

/** "Customize and edit": copies the platform template into the coach's own
 * templates, then opens the copy in the normal program editor. */
export function CustomizeButton({
  locale,
  templateId,
  size = "default",
}: {
  locale: string;
  templateId: string;
  size?: "default" | "sm";
}) {
  const t = useTranslations("programs.library.preview");
  const message = useErrorMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function customize() {
    startTransition(async () => {
      const result = await customizePlatformTemplateAction(locale, templateId);
      if ("error" in result) {
        toast.error(message(result.error));
        return;
      }
      router.push(`/programs/${result.id}`);
    });
  }

  return (
    <Button type="button" size={size} onClick={customize} disabled={pending}>
      <Copy className="size-4" aria-hidden="true" />
      {pending ? t("customizing") : t("customize")}
    </Button>
  );
}

/** "Reset to original": a fresh copy of the platform template (after a
 * confirmation). The coach's current copy moves to Trash, so it is restorable. */
export function ResetCopyButton({
  locale,
  templateId,
  copyId,
  size = "sm",
}: {
  locale: string;
  templateId: string;
  copyId: string;
  size?: "default" | "sm";
}) {
  const t = useTranslations("programs.library");
  const message = useErrorMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    startTransition(async () => {
      const result = await resetPlatformCopyAction(locale, templateId, copyId);
      if ("error" in result) {
        toast.error(message(result.error));
        return;
      }
      setOpen(false);
      router.push(`/programs/${result.id}`);
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size={size} onClick={() => setOpen(true)}>
        <RotateCcw className="size-3.5" aria-hidden="true" />
        {t("preview.reset")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("reset.title")}
        description={t("reset.description")}
        confirmLabel={pending ? t("reset.resetting") : t("reset.confirm")}
        onConfirm={reset}
        pending={pending}
        variant="default"
      />
    </>
  );
}
