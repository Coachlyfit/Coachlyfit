import { notFound } from "next/navigation";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTitle } from "@/components/dashboard/page-title";
import { InvoiceFilters } from "@/components/invoices/invoice-filters";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { formatDate, formatNumber } from "@/lib/format";
import { InvoicesService } from "@/domain/billing/invoices.service";
import { INVOICE_STATUSES, type InvoiceCurrency, type InvoiceStatus } from "@/domain/billing/invoices";
import type { AppLocale } from "@/domain/locale";

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ status?: string; client?: string }>;
}) {
  const { locale } = await params;
  const { status: rawStatus, client: rawClient } = await searchParams;
  const t = await getTranslations("invoices");
  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) notFound();

  // Unknown values from a hand-edited URL are ignored, not errors.
  const status = INVOICE_STATUSES.includes(rawStatus as InvoiceStatus) ? (rawStatus as InvoiceStatus) : undefined;
  const clientId = z.string().uuid().safeParse(rawClient).success ? rawClient : undefined;

  const [{ data: clients }, invoices] = await Promise.all([
    supabase.from("clients").select("id, display_name").order("display_name"),
    new InvoicesService(supabase).list(coachId, { status, clientId }),
  ]);
  const filtered = !!(status || clientId);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("title")} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <InvoiceFilters status={status} clientId={clientId} clients={clients ?? []} />
        <Link href={clientId ? `/invoices/new?client=${clientId}` : "/invoices/new"} className={buttonVariants()}>
          <Plus className="size-4" />
          {t("new")}
        </Link>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filtered ? t("emptyFiltered") : t("empty")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.number")}</TableHead>
                <TableHead>{t("table.client")}</TableHead>
                <TableHead>{t("table.issueDate")}</TableHead>
                <TableHead className="text-end">{t("table.total")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono font-medium">
                    <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                      {invoice.invoice_number ?? t("draftTitle")}
                    </Link>
                  </TableCell>
                  <TableCell>{invoice.clients?.display_name}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {invoice.issue_date ? formatDate(invoice.issue_date, locale) : "—"}
                  </TableCell>
                  <TableCell className="text-end font-mono tabular-nums">
                    {formatNumber(invoice.total, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                    <span className="text-xs text-muted-foreground">{t(`currency.${invoice.currency as InvoiceCurrency}`)}</span>
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={invoice.status as InvoiceStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
