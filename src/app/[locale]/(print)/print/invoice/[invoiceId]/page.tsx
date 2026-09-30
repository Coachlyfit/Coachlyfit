import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { InvoicesService } from "@/domain/billing/invoices.service";
import type { AppLocale } from "@/domain/locale";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { PrintButton } from "@/components/print/print-button";

/** Shared by coach and client -- RLS decides whether this invoice is
 * visible (a client never sees drafts). "Save as PDF" in the browser's
 * print dialog is the PDF export; the page font (IBM Plex Sans Arabic,
 * self-hosted by next/font) is embedded in that PDF, so Arabic shapes
 * correctly. */
export default async function PrintInvoicePage({
  params,
}: {
  params: Promise<{ locale: AppLocale; invoiceId: string }>;
}) {
  const { locale, invoiceId } = await params;
  const t = await getTranslations("invoices.actions");
  const service = new InvoicesService(await createClient());

  const doc = await service.getDocument(invoiceId);
  if (!doc) notFound();

  return (
    <>
      <style>{"@page { size: A4; margin: 16mm; }"}</style>
      <PrintButton label={t("print")} />
      <InvoiceDocument
        invoice={doc.invoice}
        items={doc.items}
        parties={doc.parties}
        logoUrl={service.logoUrl(doc.parties.seller.logo_path)}
        locale={locale}
      />
    </>
  );
}
