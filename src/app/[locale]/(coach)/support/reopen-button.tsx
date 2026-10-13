"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reopenTicketAction } from "./actions";

export function ReopenButton({ locale, ticketId }: { locale: string; ticketId: string }) {
  const t = useTranslations("support.thread");
  const tErrors = useTranslations("support.errors");
  const [pending, startTransition] = useTransition();

  function reopen() {
    startTransition(async () => {
      const result = await reopenTicketAction(locale, ticketId);
      if (result?.error) {
        toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("send_failed"));
        return;
      }
      toast.success(t("reopened"));
    });
  }

  return (
    <Button type="button" variant="outline" onClick={reopen} disabled={pending}>
      {t("reopen")}
    </Button>
  );
}
