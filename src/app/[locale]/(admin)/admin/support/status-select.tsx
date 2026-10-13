"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTicketStatusLabel } from "@/components/support/ticket-status-badge";
import { TICKET_STATUSES } from "@/domain/support/support";
import { setTicketStatusAction } from "./actions";

/** The admin's status control. The value is the server's: after a change the
 * page re-renders with the new status, so nothing is kept here. */
export function StatusSelect({ locale, ticketId, status }: { locale: string; ticketId: string; status: string }) {
  const t = useTranslations("admin.support");
  const tErrors = useTranslations("support.errors");
  const label = useTicketStatusLabel("admin");
  const [pending, startTransition] = useTransition();

  const items = TICKET_STATUSES.map((value) => ({ value, label: label(value) }));

  function change(next: string) {
    startTransition(async () => {
      const result = await setTicketStatusAction(locale, ticketId, next);
      if (result?.error) {
        toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("send_failed"));
        return;
      }
      toast.success(t("statusUpdated"));
    });
  }

  return (
    <Select
      value={status}
      onValueChange={(value) => value && value !== status && change(value)}
      items={items}
      disabled={pending}
    >
      <SelectTrigger aria-label={t("statusLabel")} className="h-11 min-w-44 md:h-10">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
