import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import type { InvoiceCurrency } from "@/domain/billing/invoices";
import type { AppLocale } from "@/domain/locale";

type SummaryRow = Database["public"]["Views"]["coach_finance_summary"]["Row"];

const CARD = "flex flex-col gap-1.5 rounded-xl bg-card p-4 ring-1 ring-foreground/10";
const FIGURE = "font-mono text-2xl leading-8 font-semibold tabular-nums";

/** The four totals, straight from coach_finance_summary -- nothing here is
 * added up in the app. Shown in the coach's default currency; money in any
 * other currency is listed below instead of being mixed in (there is no FX). */
export async function FinanceSummary({
  rows,
  currency,
  locale,
  now,
}: {
  rows: SummaryRow[];
  currency: InvoiceCurrency;
  locale: AppLocale;
  now: Date;
}) {
  const t = await getTranslations("finance.summary");
  const tInvoices = await getTranslations("invoices");

  const main = rows.find((row) => row.currency === currency);
  const collectedMonth = main?.collected_month ?? 0;
  const expectedMonth = main?.expected_month ?? 0;
  const outstanding = main?.outstanding_amount ?? 0;
  const outstandingCount = main?.outstanding_count ?? 0;
  const overdue = main?.overdue_amount ?? 0;
  const collectedTotal = main?.collected_total ?? 0;
  const progress = expectedMonth > 0 ? Math.min(100, Math.round((collectedMonth / expectedMonth) * 100)) : 0;

  const others = rows.filter(
    (row) =>
      row.currency !== currency && ((row.collected_total ?? 0) > 0 || (row.outstanding_amount ?? 0) > 0 || (row.overdue_amount ?? 0) > 0)
  );

  const unit = <span className="text-sm font-medium">{tInvoices(`currency.${currency}`)}</span>;
  const amount = (value: number) => formatNumber(value, locale, { maximumFractionDigits: 2 });
  const num = (chunks: React.ReactNode) => <span className="font-mono tabular-nums">{chunks}</span>;
  const collectedLabel = t("collectedMonth", { month: formatDate(now, locale, { month: "long" }) });

  // A flex row starts at the inline-start edge, so the fill grows from the
  // right in RTL without a direction-specific class.
  const bar = (
    <div
      role="progressbar"
      aria-label={t("progressLabel")}
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      className="flex h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full rounded-full bg-success" style={{ width: `${progress}%` }} />
    </div>
  );
  const expected = (
    <span className="text-muted-foreground">{t.rich("ofExpected", { amount: amount(expectedMonth), num })}</span>
  );

  return (
    <section aria-label={t("label")} className="flex flex-col gap-2">
      <div className="hidden grid-cols-2 gap-4 md:grid xl:grid-cols-4">
        <div className={CARD}>
          <span className="text-muted-foreground">{collectedLabel}</span>
          <span className={FIGURE}>
            {amount(collectedMonth)} {unit}
          </span>
          {bar}
          {expected}
        </div>
        <div className={CARD}>
          <span className="text-muted-foreground">{t("outstanding")}</span>
          <span className={FIGURE}>
            {amount(outstanding)} {unit}
          </span>
          <span className="text-muted-foreground">
            {t.rich("issuedCount", { count: outstandingCount, value: formatNumber(outstandingCount, locale), num })}
          </span>
        </div>
        <div className={CARD}>
          <span className="text-muted-foreground">{t("overdue")}</span>
          <span className={FIGURE}>
            {amount(overdue)} {unit}
          </span>
          {overdue > 0 ? (
            <Link href="/finance?status=overdue" className="w-fit font-medium text-primary underline-offset-4 hover:underline">
              {t("remind")}
            </Link>
          ) : (
            <span className="text-muted-foreground">{t("noneOverdue")}</span>
          )}
        </div>
        <div className={CARD}>
          <span className="text-muted-foreground">{t("totalCollected")}</span>
          <span className={FIGURE}>
            {amount(collectedTotal)} {unit}
          </span>
          <span className="text-muted-foreground">{t("sinceStart")}</span>
        </div>
      </div>

      <div className={`${CARD} gap-2.5 md:hidden`}>
        <span className="text-muted-foreground">{collectedLabel}</span>
        <span className="font-mono text-[1.75rem] leading-9 font-semibold tabular-nums">
          {amount(collectedMonth)} {unit}
        </span>
        {bar}
        {expected}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col rounded-lg bg-warning-tint p-2.5 text-warning-tint-foreground">
            <span>{t("outstandingShort")}</span>
            <span className="font-mono text-base font-semibold tabular-nums">{amount(outstanding)}</span>
          </div>
          <Link
            href="/finance?status=overdue"
            className="flex flex-col rounded-lg bg-destructive-tint p-2.5 text-destructive-tint-foreground"
          >
            <span>{t("overdue")}</span>
            <span className="font-mono text-base font-semibold tabular-nums">{amount(overdue)}</span>
          </Link>
        </div>
      </div>

      {others.map((row) => (
        <p key={row.currency} className="text-muted-foreground">
          {t.rich("other", {
            currency: tInvoices(`currency.${row.currency as InvoiceCurrency}`),
            collected: amount(row.collected_total ?? 0),
            outstanding: amount(row.outstanding_amount ?? 0),
            overdue: amount(row.overdue_amount ?? 0),
            num,
          })}
        </p>
      ))}
    </section>
  );
}
