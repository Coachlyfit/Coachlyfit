"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteObservationAction } from "../actions";

/** No confirm dialog -- a coach deleting their own quick note is low-stakes
 * compared to the destructive actions elsewhere in this app (deleting a
 * program, canceling a subscription) that do confirm. */
export function DeleteObservationButton({
  locale,
  clientId,
  observationId,
}: {
  locale: string;
  clientId: string;
  observationId: string;
}) {
  const tErrors = useTranslations("clients.errors");
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await deleteObservationAction(locale, clientId, observationId);
      if (result?.error) toast.error(tErrors(result.error));
    });
  }

  return (
    <Button type="button" variant="ghost" size="icon-sm" disabled={pending} onClick={onClick}>
      <Trash2 className="size-4" />
    </Button>
  );
}
