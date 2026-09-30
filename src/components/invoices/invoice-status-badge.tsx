import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/domain/billing/invoices";

const VARIANT = {
  draft: "secondary",
  issued: "info",
  paid: "success",
  void: "destructive",
} as const satisfies Record<InvoiceStatus, string>;

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const t = useTranslations("invoices.status");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
