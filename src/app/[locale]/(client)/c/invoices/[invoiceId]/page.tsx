import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight, Printer } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { createClient } from "@/lib/supabase/server";
import { InvoicesService } from "@/domain/billing/invoices.service";
import type { AppLocale } from "@/domain/locale";

export default async function ClientInvoicePage({
  params,
}: {
  params: Promise<{ locale: AppLocale; invoiceId: string }>;
}) {
  const { locale, invoiceId } = await params;
  const t = await getTranslations("invoices");
  const service = new InvoicesService(await createClient());

  // RLS: only this client's own, non-draft invoices resolve.
  const doc = await service.getDocument(invoiceId);
  if (!doc) notFound();
  const BackIcon = locale === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/c/invoices" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <BackIcon className="size-4" />
          {t("client.title")}
        </Link>
        <a
          href={`/${locale}/print/invoice/${invoiceId}`}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Printer className="size-4" />
          {t("actions.print")}
        </a>
      </div>
      <InvoiceDocument
        invoice={doc.invoice}
        items={doc.items}
        parties={doc.parties}
        logoUrl={service.logoUrl(doc.parties.seller.logo_path)}
        locale={locale}
      />
    </div>
  );
}
