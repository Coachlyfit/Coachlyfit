import { getTranslations } from "next-intl/server";
import { Receipt } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/format";
import { CoachHomeService } from "@/domain/dashboard/coach-home.service";
import type { PaymentStatus } from "@/domain/dashboard/coach-home";
import type { InvoiceCurrency } from "@/domain/billing/invoices";
import type { AppLocale } from "@/domain/locale";

const PAYMENTS_LIMIT = 5;

const TONE: Record<PaymentStatus, StatusTone> = {
  overdue: "destructive",
  due: "warning",
  paid: "success",
};

export async function PaymentsWeek({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("dashboard.payments");
  const tInvoices = await getTranslations("invoices");
  const supabase = await createClient();
  const payments = await new CoachHomeService(supabase).listPaymentsThisWeek(new Date(), PAYMENTS_LIMIT);

  return (
    <Card className="gap-4 p-5">
      <h2 id="payments-h" className="text-xl leading-7 font-semibold">
        {t("title")}
      </h2>

      {payments.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t("empty")}
          className="py-6"
          action={
            <Link href="/finance" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("viewInvoices")}
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {payments.map((payment) => (
            <li key={payment.id}>
              <Link
                href={`/invoices/${payment.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{payment.clientName}</span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {formatDate(payment.dueDate, locale, { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </span>
                </div>
                <span className="font-mono font-medium tabular-nums">
                  {formatNumber(payment.total, locale)}{" "}
                  <span className="text-xs text-muted-foreground">
                    {tInvoices(`currency.${payment.currency as InvoiceCurrency}`)}
                  </span>
                </span>
                <StatusBadge tone={TONE[payment.status]}>{t(`status.${payment.status}`)}</StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
