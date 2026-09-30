"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INVOICE_STATUSES } from "@/domain/billing/invoices";

const ALL = "all";

/** Filters live in the URL (?status=&client=) so the list stays a Server
 * Component and a filtered view is linkable -- same router.replace idiom as
 * range-picker.tsx. */
export function InvoiceFilters({
  status,
  clientId,
  clients,
}: {
  status: string | undefined;
  clientId: string | undefined;
  clients: { id: string; display_name: string }[];
}) {
  const t = useTranslations("invoices");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function update(key: "status" | "client", value: string | null) {
    const params = new URLSearchParams();
    const next = { status, client: clientId, [key]: value === ALL ? undefined : value };
    if (next.status) params.set("status", next.status);
    if (next.client) params.set("client", next.client);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <div className={`flex flex-wrap gap-2 ${pending ? "opacity-60" : ""}`}>
      <Select value={status ?? ALL} onValueChange={(v) => update("status", v)}>
        <SelectTrigger className="min-w-40" aria-label={t("table.status")}>
          <SelectValue>{(v: string) => (v === ALL ? t("filters.allStatuses") : t(`status.${v}` as "status.draft"))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("filters.allStatuses")}</SelectItem>
          {INVOICE_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`status.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={clientId ?? ALL} onValueChange={(v) => update("client", v)}>
        <SelectTrigger className="min-w-48" aria-label={t("table.client")}>
          <SelectValue>
            {(v: string) => (v === ALL ? t("filters.allClients") : (clients.find((c) => c.id === v)?.display_name ?? ""))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("filters.allClients")}</SelectItem>
          {clients.map((client) => (
            <SelectItem key={client.id} value={client.id}>
              {client.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
