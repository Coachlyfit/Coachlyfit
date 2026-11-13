"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { updateFromTemplateAction } from "../actions";

/** "Update from template" for one client's copy: replaces it with the template
 * as it is now, on the same dates. The old copy goes to Trash, not away. */
export function UpdateFromTemplateButton({
  locale,
  templateId,
  programId,
}: {
  locale: string;
  templateId: string;
  programId: string;
}) {
  const t = useTranslations("programs.propagate");
  const tErrors = useTranslations("programs.errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await updateFromTemplateAction(locale, templateId, programId);
      if ("error" in result) {
        toast.error(tErrors(result.error));
        return;
      }
      setOpen(false);
      toast.success(t("success"));
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <RefreshCw className="size-3.5" aria-hidden="true" />
        {t("button")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        description={t("description")}
        confirmLabel={t("confirm")}
        onConfirm={confirm}
        pending={pending}
        variant="default"
      />
    </>
  );
}
