"use client";

import { useMemo, useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { ClientAvatar } from "@/app/[locale]/(coach)/dashboard/client-avatar";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { DueNote, InvoiceCurrency, InvoiceDisplayStatus } from "@/domain/billing/invoices";
import { FINANCE_TABS, type FinanceTab, type StatusFilter } from "./filters";
import { InvoiceRowActions } from "./invoice-row-actions";
import type { PaymentMethodOption } from "./record-payment-dialog";


export type InvoiceRow = {
  id: string;
  /** null while a draft: numbers are assigned at issue time. */
  number: string | null;
  item: string | null;
  clientId: string;
  clientName: string;
  dueDate: string | null;
  total: number;
  currency: InvoiceCurrency;
  status: InvoiceDisplayStatus;
  note: DueNote;
  hasPayment: boolean;
};

export type PaymentRow = {
  id: string;
  clientName: string;
  method: string;
  invoice: { id: string; number: string } | null;
  date: string;
  amount: number;
  currency: InvoiceCurrency;
};

// draft / void have no tone: nothing to act on, so they stay neutral.
const STATUS_TONE: Partial<Record<InvoiceDisplayStatus, StatusTone>> = {
  overdue: "destructive",
  issued: "warning",
  paid: "success",
};

const NOTE_COLOR: Partial<Record<DueNote["kind"], string>> = {
  overdue: "text-destructive-tint-foreground",
  paid: "text-success-tint-foreground",
};

// void only gets a chip when there is something behind it.
const CHIPS = ["all", "overdue", "issued", "draft", "paid", "void"] as const satisfies readonly StatusFilter[];

const ALL = "__all__";
const DAY: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
const MONEY = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

export function FinanceView({
  locale,
  tab,
  status,
  clientId,
  month,
  clients,
  months,
  invoices,
  payments,
  coachId,
  paymentMethods,
}: {
  locale: AppLocale;
  tab: FinanceTab;
  status: StatusFilter;
  clientId: string | undefined;
  month: string | undefined;
  clients: { id: string; display_name: string }[];
  months: { value: string; label: string }[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  coachId: string;
  paymentMethods: PaymentMethodOption[];
}) {
  const t = useTranslations("finance");
  const tInvoices = useTranslations("invoices");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // The URL is the source of truth (a filtered view is linkable); tab and
  // status are optimistic so they switch on click, not after the round trip
  // -- same idiom as clients-table.tsx.
  const [view, setView] = useOptimistic({ tab, status });

  function go(next: { tab?: FinanceTab; status?: StatusFilter; client?: string | null; month?: string | null }) {
    const state = { tab: view.tab, status: view.status, client: clientId ?? null, month: month ?? null, ...next };
    const params = new URLSearchParams();
    if (state.tab !== "invoices") params.set("tab", state.tab);
    if (state.status !== "all") params.set("status", state.status);
    if (state.client) params.set("client", state.client);
    if (state.month) params.set("month", state.month);
    const query = params.toString();
    startTransition(() => {
      setView({ tab: state.tab, status: state.status });
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  // ponytail: counts and the status filter run over the loaded rows (the list
  // was never paginated). Move both server-side -- status filter + a grouped
  // count -- when a coach has thousands of invoices.
  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: invoices.length, overdue: 0, issued: 0, draft: 0, paid: 0, void: 0 };
    for (const invoice of invoices) result[invoice.status]++;
    return result;
  }, [invoices]);

  const shown = view.status === "all" ? invoices : invoices.filter((i) => i.status === view.status);
  const filtered = view.status !== "all" || !!clientId || !!month;

  const clientOptions = [
    { value: ALL, label: t("filters.allClients") },
    ...clients.map((c) => ({ value: c.id, label: c.display_name })),
  ];
  const monthOptions = [{ value: ALL, label: t("filters.allMonths") }, ...months];

  const money = (amount: number, currency: InvoiceCurrency) => (
    <>
      {formatNumber(amount, locale, MONEY)}{" "}
      <span className="text-xs font-medium text-muted-foreground">{tInvoices(`currency.${currency}`)}</span>
    </>
  );

  function noteText(note: DueNote): string | null {
    switch (note.kind) {
      case "overdue":
      case "dueIn":
        return t(`note.${note.kind}`, { count: note.days });
      case "paid":
        return note.date
          ? t("note.paid", { date: formatDate(note.date, locale, { day: "2-digit", month: "2-digit" }) })
          : null;
      case "none":
        return null;
      default:
        return t(`note.${note.kind}`);
    }
  }

  const statusBadge = (s: InvoiceDisplayStatus) =>
    STATUS_TONE[s] ? (
      <StatusBadge tone={STATUS_TONE[s]}>{t(`status.${s}`)}</StatusBadge>
    ) : (
      <Badge variant="secondary" className="rounded-md">
        {t(`status.${s}`)}
      </Badge>
    );

  const actions = (invoice: InvoiceRow, layout: "row" | "card") => (
    <InvoiceRowActions
      invoice={{
        id: invoice.id,
        number: invoice.number ?? tInvoices("draftTitle"),
        clientId: invoice.clientId,
        clientName: invoice.clientName,
        total: invoice.total,
        currency: invoice.currency,
      }}
      status={invoice.status}
      hasPayment={invoice.hasPayment}
      coachId={coachId}
      paymentMethods={paymentMethods}
      layout={layout}
    />
  );

  return (
    <section
      aria-label={t("recordsLabel")}
      className="flex flex-col gap-3.5 md:gap-0 md:overflow-hidden md:rounded-xl md:bg-card md:ring-1 md:ring-foreground/10"
    >
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between md:border-b md:border-border md:px-4 md:py-2.5">
        {/* Segmented control on a phone, underlined tabs from md up. */}
        <div
          role="tablist"
          aria-label={t("tabs.label")}
          className="flex gap-1 rounded-xl bg-muted p-1 md:gap-5 md:rounded-none md:bg-transparent md:p-0"
        >
          {FINANCE_TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`finance-tab-${key}`}
              aria-selected={view.tab === key}
              aria-controls="finance-panel"
              onClick={() => go({ tab: key })}
              className="h-10 flex-1 rounded-lg font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-selected:bg-card aria-selected:shadow-xs md:flex-none md:rounded-none md:border-b-2 md:border-transparent md:text-base md:font-normal md:aria-selected:border-primary md:aria-selected:bg-transparent md:aria-selected:font-semibold md:aria-selected:shadow-none"
            >
              {t(`tabs.${key}`)}{" "}
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {formatNumber(key === "invoices" ? invoices.length : payments.length, locale)}
              </span>
            </button>
          ))}
        </div>
        <div className={cn("flex flex-wrap gap-2", pending && "opacity-60")}>
          <Select
            value={clientId ?? ALL}
            onValueChange={(v) => go({ client: v === ALL ? null : (v as string) })}
            items={clientOptions}
          >
            <SelectTrigger aria-label={t("filters.client")} className="min-w-0 flex-1 md:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {clientOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={month ?? ALL}
            onValueChange={(v) => go({ month: v === ALL ? null : (v as string) })}
            items={monthOptions}
          >
            <SelectTrigger aria-label={t("filters.month")} className="min-w-0 flex-1 md:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        role="tabpanel"
        id="finance-panel"
        aria-labelledby={`finance-tab-${view.tab}`}
        className="flex flex-col gap-3.5 md:gap-0"
      >
        {view.tab === "invoices" ? (
          <>
            <div
              role="group"
              aria-label={t("statusLabel")}
              className="flex gap-1.5 overflow-x-auto md:flex-wrap md:px-4 md:py-3"
            >
              {CHIPS.filter((key) => key !== "void" || counts.void > 0 || view.status === "void").map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view.status === key}
                  onClick={() => go({ status: key })}
                  className="h-9 shrink-0 rounded-full border border-border bg-card px-3 font-medium outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
                >
                  {t(`status.${key}`)}{" "}
                  <span className="font-mono text-xs tabular-nums">{formatNumber(counts[key], locale)}</span>
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <EmptyState
                brandMark
                title={filtered ? t("empty.filteredTitle") : t("empty.invoicesTitle")}
                description={filtered ? t("empty.filteredBody") : t("empty.invoicesBody")}
                className="rounded-xl bg-card ring-1 ring-foreground/10 md:rounded-none md:border-t md:border-border md:ring-0"
                action={
                  filtered ? undefined : (
                    <Link href="/invoices/new" className={buttonVariants()}>
                      <Plus className="size-4" aria-hidden="true" />
                      {t("newInvoice")}
                    </Link>
                  )
                }
              />
            ) : (
              <>
                <div className="hidden md:block">
                  <Table className="min-w-[820px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("table.invoice")}</TableHead>
                        <TableHead>{t("table.client")}</TableHead>
                        <TableHead>{t("table.due")}</TableHead>
                        <TableHead className="text-end">{t("table.amount")}</TableHead>
                        <TableHead>{t("table.status")}</TableHead>
                        <TableHead>
                          <span className="sr-only">{t("table.actions")}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.map((invoice) => {
                        const note = noteText(invoice.note);
                        return (
                          <TableRow key={invoice.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <Link
                                  href={`/invoices/${invoice.id}`}
                                  className="font-mono font-semibold tabular-nums hover:underline"
                                >
                                  {invoice.number ?? tInvoices("draftTitle")}
                                </Link>
                                {invoice.item && (
                                  <span className="max-w-56 truncate text-muted-foreground">{invoice.item}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex min-w-0 items-center gap-2.5">
                                <ClientAvatar id={invoice.clientId} name={invoice.clientName} size="default" />
                                <span className="truncate">{invoice.clientName}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-mono tabular-nums">
                                  {invoice.dueDate ? formatDate(invoice.dueDate, locale, DAY) : "—"}
                                </span>
                                {note && (
                                  <span className={NOTE_COLOR[invoice.note.kind] ?? "text-muted-foreground"}>{note}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-end font-mono font-semibold whitespace-nowrap tabular-nums">
                              {money(invoice.total, invoice.currency)}
                            </TableCell>
                            <TableCell>{statusBadge(invoice.status)}</TableCell>
                            <TableCell>{actions(invoice, "row")}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <ul className="flex flex-col gap-3.5 md:hidden">
                  {shown.map((invoice) => {
                    const note = noteText(invoice.note);
                    return (
                      <li
                        key={invoice.id}
                        className="flex flex-col gap-2.5 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10"
                      >
                        <div className="flex items-center gap-2.5">
                          <ClientAvatar id={invoice.clientId} name={invoice.clientName} />
                          <Link href={`/invoices/${invoice.id}`} className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate font-semibold">{invoice.clientName}</span>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">
                              {invoice.number ?? tInvoices("draftTitle")}
                            </span>
                          </Link>
                          {statusBadge(invoice.status)}
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={NOTE_COLOR[invoice.note.kind] ?? "text-muted-foreground"}>{note}</span>
                          <span className="font-mono text-lg font-semibold tabular-nums">
                            {money(invoice.total, invoice.currency)}
                          </span>
                        </div>
                        {actions(invoice, "card")}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        ) : payments.length === 0 ? (
          <EmptyState
            brandMark
            title={clientId || month ? t("empty.filteredTitle") : t("empty.paymentsTitle")}
            description={clientId || month ? t("empty.filteredBody") : t("empty.paymentsBody")}
            className="rounded-xl bg-card ring-1 ring-foreground/10 md:rounded-none md:ring-0"
          />
        ) : (
          <ul className="flex flex-col gap-3.5 md:gap-0 md:divide-y md:divide-border">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10 md:rounded-none md:px-4 md:ring-0"
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success-tint text-success-tint-foreground"
                  aria-hidden="true"
                >
                  <Check className="size-4.5" />
                </span>
                <div className="flex min-w-0 flex-[1_1_180px] flex-col">
                  <span className="truncate font-medium">{payment.clientName}</span>
                  <span className="text-muted-foreground">
                    {payment.method}
                    {payment.invoice && (
                      <>
                        {" · "}
                        {t.rich("payments.for", {
                          number: payment.invoice.number,
                          num: (chunks) => (
                            <Link
                              href={`/invoices/${payment.invoice!.id}`}
                              className="font-mono tabular-nums hover:underline"
                            >
                              {chunks}
                            </Link>
                          ),
                        })}
                      </>
                    )}
                  </span>
                </div>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {formatDate(payment.date, locale, DAY)}
                </span>
                <span className="font-mono font-semibold text-success-tint-foreground tabular-nums">
                  +{formatNumber(payment.amount, locale, MONEY)} {tInvoices(`currency.${payment.currency}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
