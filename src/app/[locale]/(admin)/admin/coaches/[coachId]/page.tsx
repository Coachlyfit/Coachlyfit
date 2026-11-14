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
import { tierTitle } from "@/domain/billing/plans";
import { Link } from "@/i18n/navigation";
import { RecordPaymentDialog } from "../../record-payment-dialog";
import { TRIAL_ENDING_SOON_DAYS as DAYS_SOON } from "@/domain/billing/coach-stage";
import { ImpersonateButton } from "./impersonate-button";
import { CoachNoteForm, ManageSubscriptionDialog, SuspendButton } from "./subscription-controls";
import { RequestsList } from "../../requests/requests-list";
import { changes, noteOf, show } from "@/domain/platform/audit";

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
  const tPlans = await getTranslations("plans");
  const tAudit = await getTranslations("admin.settings.audit");
  const supabase = await createClient();

  const [{ data: coaches }, { data: payments }, { data: tiers }, { data: requests }, { data: activity }] =
    await Promise.all([
      supabase.rpc("admin_list_coaches"),
      supabase.from("payments").select("*").eq("coach_id", coachId).order("created_at", { ascending: false }),
      supabase.from("subscription_tiers").select("id, key, name_ar, name_en, max_clients").order("price_egp_monthly"),
      supabase
        .from("subscription_requests")
        .select("id, coach_id, type, note, status, admin_response, created_at, subscription_tiers(key, name_ar, name_en, max_clients)")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false })
        .limit(20),
      // A coach's id is their owner's user id, which is what the log targets.
      supabase
        .from("admin_audit_log")
        .select("id, created_at, admin_name, action, details")
        .eq("target_user_id", coachId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  const coach = coaches?.find((c) => c.coach_id === coachId);
  if (!coach) notFound();

  const tierOptions = (tiers ?? []).map((tier) => ({ id: tier.id, name: tierTitle(tier, locale, tPlans) }));
  const tierName = tierOptions.find((tier) => tier.id === coach.tier_id)?.name ?? coach.tier_key;
  const periodEnd =
    coach.status === "trialing" ? (coach.trial_ends_at ?? coach.current_period_end) : coach.current_period_end;

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
          {coach.is_complimentary && <Badge variant="secondary">{t("complimentary")}</Badge>}
          {coach.cancel_at_period_end && <Badge variant="warning">{td("cancelScheduled")}</Badge>}
          {coach.suspended_at && <Badge variant="destructive">{td("suspended")}</Badge>}
          <div className="flex flex-wrap gap-2">
            <ManageSubscriptionDialog
              locale={locale}
              coachId={coach.coach_id}
              tiers={tierOptions}
              current={
                coach.tier_id && coach.status
                  ? {
                      tierId: coach.tier_id,
                      status: coach.status,
                      periodEnd,
                      cancelAtPeriodEnd: coach.cancel_at_period_end,
                      complimentary: coach.is_complimentary,
                    }
                  : null
              }
            />
            <SuspendButton locale={locale} coachId={coach.coach_id} suspended={!!coach.suspended_at} />
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
            <p className="text-2xl font-semibold">{tierName ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("table.period")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {periodEnd ? formatDate(periodEnd, locale) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {requests && requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{td("requestsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <RequestsList
              locale={locale}
              requests={requests.map((row) => ({
                id: row.id,
                coachId: row.coach_id,
                type: row.type,
                tierName: row.subscription_tiers ? tierTitle(row.subscription_tiers, locale, tPlans) : null,
                note: row.note,
                status: row.status,
                adminResponse: row.admin_response,
                createdAt: row.created_at,
              }))}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{td("activity.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CoachNoteForm locale={locale} coachId={coach.coach_id} />
          {!activity || activity.length === 0 ? (
            <p className="text-muted-foreground">{td("activity.empty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {activity.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {tAudit.has(`actions.${entry.action}`) ? tAudit(`actions.${entry.action}`) : entry.action}
                    </Badge>
                    <span className="text-muted-foreground">{entry.admin_name ?? "—"}</span>
                    <span className="ms-auto text-xs tabular-nums text-muted-foreground">
                      {formatDate(entry.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </div>
                  {changes(entry.details).map(([field, change]) => (
                    <p key={field} className="text-xs text-muted-foreground">
                      {tAudit.has(`fields.${field}`) ? tAudit(`fields.${field}`) : field}: {show(change.from)} →{" "}
                      {show(change.to)}
                    </p>
                  ))}
                  {noteOf(entry.details) && <p className="whitespace-pre-wrap">{noteOf(entry.details)}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
