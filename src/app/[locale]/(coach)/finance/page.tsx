import { notFound } from "next/navigation";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { PageTitle } from "@/components/dashboard/page-title";
import { FinanceSummary } from "@/components/finance/finance-summary";
import { FinanceView, type InvoiceRow, type PaymentRow } from "@/components/finance/finance-view";
import { FINANCE_TABS, STATUS_FILTERS, type FinanceTab, type StatusFilter } from "@/components/finance/filters";
import { RecordPaymentButton, type PayableInvoice } from "@/components/finance/record-payment-dialog";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ClientBillingService } from "@/domain/billing/client-billing.service";
import { InvoicesService } from "@/domain/billing/invoices.service";
import { dueNote, invoiceDisplayStatus, type InvoiceCurrency } from "@/domain/billing/invoices";
import { pickLocale, type AppLocale } from "@/domain/locale";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS_BACK = 12;

/** The month filter's options: this month and the 11 before it, plus the
 * requested one if a link points further back. */
function monthOptions(now: Date, selected: string | undefined, locale: AppLocale) {
  const values = Array.from({ length: MONTHS_BACK }, (_, i) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7)
  );
  if (selected && !values.includes(selected)) values.push(selected);
  return values.map((value) => ({
    value,
    label: formatDate(`${value}-01`, locale, { month: "long", year: "numeric", timeZone: "UTC" }),
  }));
}

// Coach -> client money in one place: invoices and the payments recorded
// against them. The coach's own Coachly Fit subscription is a different
// direction of money and only gets a link here (/settings/subscription).
export default async function FinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ tab?: string; status?: string; client?: string; month?: string }>;
}) {
  const { locale } = await params;
  const raw = await searchParams;
  const t = await getTranslations("finance");
  const tBilling = await getTranslations("billing");
  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) notFound();

  // Unknown values from a hand-edited URL are ignored, not errors.
  const tab: FinanceTab = FINANCE_TABS.includes(raw.tab as FinanceTab) ? (raw.tab as FinanceTab) : "invoices";
  const status: StatusFilter = STATUS_FILTERS.includes(raw.status as StatusFilter) ? (raw.status as StatusFilter) : "all";
  const clientId = z.string().uuid().safeParse(raw.client).success ? raw.client : undefined;
  const month = raw.month && MONTH.test(raw.month) ? raw.month : undefined;

  const invoicesService = new InvoicesService(supabase);
  const billing = new ClientBillingService(supabase);
  const [{ data: clients }, { data: coach }, { data: subscription }, invoices, transactions, summary, unpaid, paymentMethods] =
    await Promise.all([
      supabase.from("clients").select("id, display_name").order("display_name"),
      supabase.from("coaches").select("default_currency").eq("id", coachId).single(),
      supabase.from("subscriptions").select("status, subscription_tiers(name_ar, name_en)").maybeSingle(),
      invoicesService.list(coachId, { clientId, month }),
      billing.listAllTransactions(coachId, { clientId, month }),
      invoicesService.summary(coachId),
      invoicesService.listUnpaid(coachId),
      billing.listPaymentMethods(coachId),
    ]);

  const now = new Date();
  const invoiceRows: InvoiceRow[] = invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.invoice_number,
    item: invoice.invoice_items[0]?.description ?? null,
    clientId: invoice.client_id,
    clientName: invoice.clients?.display_name ?? "",
    dueDate: invoice.due_date,
    total: invoice.total,
    currency: invoice.currency as InvoiceCurrency,
    status: invoiceDisplayStatus(invoice, now),
    note: dueNote(invoice, now),
    hasPayment: invoice.transaction_id != null,
  }));

  const paymentRows: PaymentRow[] = transactions.map((tx) => {
    // A voided invoice no longer stands for this payment.
    const invoice = tx.invoices.find((i) => i.status !== "void" && i.invoice_number);
    return {
      id: tx.id,
      clientName: tx.clients?.display_name ?? "",
      method: pickLocale(tx.client_payment_methods, locale),
      invoice: invoice ? { id: invoice.id, number: invoice.invoice_number! } : null,
      date: tx.transaction_date,
      amount: tx.amount_egp,
      currency: tx.currency as InvoiceCurrency,
    };
  });

  // An invoice created from a recorded payment is settled from its own row
  // (a status flip) -- offering it here would record the money twice.
  const payable: PayableInvoice[] = unpaid
    .filter((invoice) => invoice.transaction_id == null)
    .map((invoice) => ({
      id: invoice.id,
      number: invoice.invoice_number ?? "",
      clientId: invoice.client_id,
      clientName: invoice.clients?.display_name ?? "",
      total: invoice.total,
      currency: invoice.currency as InvoiceCurrency,
    }));

  const newInvoiceHref = clientId ? `/invoices/new?client=${clientId}` : "/invoices/new";
  const tier = subscription?.subscription_tiers;
  const headerActions = (className: string, buttonClassName?: string) => (
    <div className={className}>
      <RecordPaymentButton
        coachId={coachId}
        invoices={payable}
        paymentMethods={paymentMethods}
        className={buttonClassName}
      />
      <Link href={newInvoiceHref} className={cn(buttonVariants(), buttonClassName)}>
        <Plus className="size-4" aria-hidden="true" />
        {t("newInvoice")}
      </Link>
    </div>
  );

  return (
    // pb-20 below md: room for the pinned action bar.
    <div className="flex flex-col gap-5 pb-20 md:pb-0">
      <PageTitle title={t("title")} />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl leading-9 font-semibold">{t("title")}</h1>
          <p className="text-base text-muted-foreground">{t("subtitle")}</p>
        </div>
        {headerActions("hidden flex-wrap gap-2 md:flex")}
      </header>

      <FinanceSummary
        rows={summary}
        currency={(coach?.default_currency ?? "EGP") as InvoiceCurrency}
        locale={locale}
        now={now}
      />

      <FinanceView
        locale={locale}
        tab={tab}
        status={status}
        clientId={clientId}
        month={month}
        clients={clients ?? []}
        months={monthOptions(now, month, locale)}
        invoices={invoiceRows}
        payments={paymentRows}
        coachId={coachId}
        paymentMethods={paymentMethods}
      />

      <section
        aria-label={t("subscription.label")}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-dashed border-border px-4 py-3.5"
      >
        <div className="flex min-w-0 flex-[1_1_240px] flex-col">
          <span className="font-semibold">{t("subscription.title")}</span>
          <span className="text-muted-foreground">
            {tier && subscription
              ? t("subscription.current", { plan: pickLocale(tier, locale), status: tBilling(`status.${subscription.status}`) })
              : t("subscription.none")}
          </span>
        </div>
        <Link href="/settings/subscription" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("subscription.manage")}
        </Link>
      </section>

      {/* end-[4.75rem]: stops short of the feedback button pinned at end-4. */}
      {headerActions(
        "fixed start-4 end-[4.75rem] bottom-[calc(var(--bottom-nav-h)+0.5rem)] z-30 flex gap-2 md:hidden",
        "flex-1 shadow-lg"
      )}
    </div>
  );
}
