import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PageTitle } from "@/components/dashboard/page-title";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { createClient } from "@/lib/supabase/server";
import { ClientBillingService } from "@/domain/billing/client-billing.service";
import { InvoicesService } from "@/domain/billing/invoices.service";
import type { InvoiceCurrency, InvoiceStatus } from "@/domain/billing/invoices";
import type { AppLocale } from "@/domain/locale";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ locale: AppLocale; invoiceId: string }>;
}) {
  const { locale, invoiceId } = await params;
  const t = await getTranslations("invoices");
  const supabase = await createClient();
  const service = new InvoicesService(supabase);

  const doc = await service.getDocument(invoiceId);
  if (!doc) notFound();
  const { invoice, items, parties } = doc;
  const status = invoice.status as InvoiceStatus;
  const BackIcon = locale === "ar" ? ArrowRight : ArrowLeft;

  // Paying an issued invoice records the payment behind it -- unless it was
  // created from a payment that is already recorded.
  const payment =
    status === "issued" && invoice.transaction_id == null
      ? {
          coachId: invoice.coach_id,
          paymentMethods: await new ClientBillingService(supabase).listPaymentMethods(invoice.coach_id),
          invoice: {
            id: invoice.id,
            number: invoice.invoice_number ?? "",
            clientId: invoice.client_id,
            clientName: parties.client.display_name,
            total: invoice.total,
            currency: invoice.currency as InvoiceCurrency,
          },
        }
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={invoice.invoice_number ?? t("draftTitle")} />
      <Link href="/finance" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <BackIcon className="size-4" />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{parties.client.display_name}</span>
          <InvoiceStatusBadge status={status} />
        </div>
        <InvoiceActions invoiceId={invoice.id} status={status} payment={payment} />
      </div>

      {status === "draft" ? (
        <InvoiceForm
          invoiceId={invoice.id}
          clients={[{ id: invoice.client_id, display_name: parties.client.display_name }]}
          defaultValues={{
            client_id: invoice.client_id,
            currency: invoice.currency as InvoiceCurrency,
            tax_rate: invoice.tax_rate,
            issue_date: invoice.issue_date ?? "",
            due_date: invoice.due_date ?? "",
            notes: invoice.notes ?? "",
            items: items.map(({ description, quantity, unit_price }) => ({ description, quantity, unit_price })),
          }}
        />
      ) : (
        <InvoiceDocument
          invoice={invoice}
          items={items}
          parties={parties}
          logoUrl={service.logoUrl(parties.seller.logo_path)}
          locale={locale}
        />
      )}
    </div>
  );
}
