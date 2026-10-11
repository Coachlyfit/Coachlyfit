import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { Link } from "@/i18n/navigation";
import { RecordPaymentDialog } from "../../record-payment-dialog";
import { TRIAL_ENDING_SOON_DAYS as DAYS_SOON } from "@/domain/billing/coach-stage";
import { ImpersonateButton } from "./impersonate-button";

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export default async function AdminCoachDetailPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; coachId: string }>;
}) {
  const { locale, coachId } = await params;
  const t = await getTranslations("admin.coaches");
  const td = await getTranslations("admin.coaches.detail");
  const supabase = await createClient();

  const [{ data: coaches }, { data: payments }] = await Promise.all([
    supabase.rpc("admin_list_coaches"),
    supabase.from("payments").select("*").eq("coach_id", coachId).order("created_at", { ascending: false }),
  ]);

  const coach = coaches?.find((c) => c.coach_id === coachId);
  if (!coach) notFound();

  let risk: { label: string; tone: "warning" | "destructive" | "success" } | null = null;
  if (coach.status === "past_due") {
    risk = { label: td("risk.pastDue"), tone: "destructive" };
  } else if (coach.status === "canceled") {
    risk = { label: td("risk.canceled"), tone: "destructive" };
  } else if (coach.status === "trialing" && coach.trial_ends_at && daysUntil(coach.trial_ends_at) <= DAYS_SOON) {
    risk = { label: td("risk.trialEndingSoon", { days: Math.max(0, daysUntil(coach.trial_ends_at)) }), tone: "warning" };
  } else if (coach.status === "active") {
    risk = { label: td("risk.good"), tone: "success" };
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
        ← {t("title")}
      </Link>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{coach.business_name}</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {coach.coach_id}
              {coach.phone && ` · ${coach.phone}`}
              {" · "}
              {td("joined", { date: formatDate(coach.created_at, locale) })}
            </p>
          </div>
          {risk && <Badge variant={risk.tone}>{risk.label}</Badge>}
          <div className="flex gap-2">
            <ImpersonateButton locale={locale} coachId={coach.coach_id} />
            <RecordPaymentDialog locale={locale} coachId={coach.coach_id} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("table.clients")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{coach.client_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("table.mrr")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{formatNumber(coach.mrr_egp, locale)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("table.tier")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{coach.tier_key ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("table.period")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {coach.current_period_end ? formatDate(coach.current_period_end, locale) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{td("billing.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!payments || payments.length === 0 ? (
            <EmptyState title={td("billing.empty")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{td("billing.date")}</TableHead>
                  <TableHead>{td("billing.period")}</TableHead>
                  <TableHead>{td("billing.method")}</TableHead>
                  <TableHead>{td("billing.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-muted-foreground">{formatDate(payment.created_at, locale)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(payment.period_start, locale, { month: "short", day: "numeric" })}
                      {" – "}
                      {formatDate(payment.period_end, locale, { month: "short", day: "numeric" })}
                    </TableCell>
                    <TableCell>{t(`methods.${payment.method}`)}</TableCell>
                    <TableCell className="tabular-nums">{formatNumber(payment.amount_egp, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
