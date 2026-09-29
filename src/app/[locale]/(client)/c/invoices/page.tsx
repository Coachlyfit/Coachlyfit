import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/format";
import { InvoicesService } from "@/domain/billing/invoices.service";
import type { InvoiceCurrency, InvoiceStatus } from "@/domain/billing/invoices";
import type { AppLocale } from "@/domain/locale";

export default async function ClientInvoicesPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const t = await getTranslations("invoices");
  const supabase = await createClient();
  const user = await getAuthUser();

  // The (client) layout already redirected anyone without a linked row.
  const { data: clientRow } = await supabase.from("clients").select("id").eq("profile_id", user!.id).single();
  const invoices = clientRow ? await new InvoicesService(supabase).listForClient(clientRow.id) : [];
  const ChevronIcon = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("client.title")}</h1>
      {invoices.length === 0 ? (
        <EmptyState title={t("client.empty")} />
      ) : (
        <div className="flex flex-col gap-2">
          {invoices.map((invoice) => (
            <Link key={invoice.id} href={`/c/invoices/${invoice.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-medium">{invoice.invoice_number}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {invoice.issue_date ? formatDate(invoice.issue_date, locale) : null}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {formatNumber(invoice.total, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                      <span className="text-xs font-normal">{t(`currency.${invoice.currency as InvoiceCurrency}`)}</span>
                    </span>
                    <InvoiceStatusBadge status={invoice.status as InvoiceStatus} />
                  </div>
                  <ChevronIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
