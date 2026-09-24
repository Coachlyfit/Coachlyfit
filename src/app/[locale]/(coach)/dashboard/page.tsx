import { getTranslations } from "next-intl/server";
import { ClipboardCheck, ChevronRight, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { NotificationsService } from "@/domain/notifications/notifications.service";
import { PresenceService } from "@/domain/presence/presence.service";
import { LedgerService } from "@/domain/ledger/ledger.service";
import { OutcomeBadge } from "@/components/ledger/outcome-badge";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate, formatNumber } from "@/lib/format";
import { PageTitle } from "@/components/dashboard/page-title";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { Link } from "@/i18n/navigation";
import { OnlineClients } from "./online-clients";

const RECENT_SUBMISSIONS_LIMIT = 5;
const RECENT_WINDOW_DAYS = 7;
const FOLLOW_UPS_LIMIT = 5;

function kpiLabelClass() {
  return "font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground";
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("dashboard");
  const tNotifications = await getTranslations("notifications");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const since = new Date(new Date().getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: profile },
    { count: clientCount },
    { data: subscription },
    { count: recentSubmissionCount },
    { data: recentSubmissions },
    { data: payments },
    { count: pendingReviewCount },
    onlineClients,
    recentOutcomes,
  ] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user!.id).single(),
    supabase.from("clients").select("id", { count: "exact", head: true }).neq("status", "archived"),
    supabase
      .from("subscriptions")
      .select("status, trial_ends_at, current_period_end, subscription_tiers(name_ar, name_en, max_clients)")
      .single(),
    supabase
      .from("form_submissions")
      .select("id", { count: "exact", head: true })
      .gte("submitted_at", since),
    supabase
      .from("form_submissions")
      .select(
        "id, submitted_at, clients(display_name), form_template_versions(form_templates!form_template_versions_template_id_fkey(name_ar, name_en))"
      )
      .order("submitted_at", { ascending: false })
      .limit(RECENT_SUBMISSIONS_LIMIT),
    // MRR proxy: payments recorded this calendar month. There's no
    // subscription-level MRR field, so this reads current cash-in, not a
    // forward-looking recurring estimate — labelled the same as the design
    // ("MRR · EGP") since that's the closest available number, not a
    // materially different metric worth a different label.
    supabase
      .from("payments")
      .select("amount_egp")
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    supabase.from("checkins").select("id", { count: "exact", head: true }).is("reviewed_at", null),
    new PresenceService(supabase).list({ pageSize: 10 }),
    new LedgerService(supabase).listRecentOutcomes(),
  ]);

  const tier = subscription?.subscription_tiers;
  const periodLabel = subscription?.status === "trialing" ? "trialEndsAt" : "renewsAt";
  const periodValue =
    subscription?.status === "trialing" ? subscription.trial_ends_at : subscription?.current_period_end;
  const mrr = (payments ?? []).reduce((sum, p) => sum + p.amount_egp, 0);
  const notifications = await new NotificationsService(supabase).listRecent();

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("welcome", { name: profile?.full_name ?? "" })} />
      <AutoRefresh />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className={kpiLabelClass()}>{t("kpi.online")}</div>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-success">{onlineClients.online}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className={kpiLabelClass()}>{t("kpi.clients")}</div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{clientCount ?? 0}</p>
            {tier && <p className="mt-1 text-sm text-muted-foreground">{t("clientLimit", { max: tier.max_clients })}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className={kpiLabelClass()}>{t("kpi.submissions")}</div>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-primary">{recentSubmissionCount ?? 0}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("kpi.submissionsWindow")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className={kpiLabelClass()}>{t("kpi.mrr")}</div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{formatNumber(mrr, locale)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("plan")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 pt-0">
            <p className="text-2xl font-semibold">{tier ? pickLocale(tier, locale) : "—"}</p>
            {subscription && (
              <Badge variant={subscription.status === "active" ? "default" : "secondary"}>
                {t(`status.${subscription.status}`)}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {!!pendingReviewCount && (
        <Link
          href="/review"
          className="flex items-center gap-3 rounded-lg border border-warning-tint-foreground/30 bg-warning-tint px-4 py-3 text-warning-tint-foreground hover:bg-warning-tint/80"
        >
          <ClipboardCheck className="size-5 shrink-0" aria-hidden="true" />
          <p className="flex-1 text-sm font-medium">
            {t("pendingReview", { count: pendingReviewCount })}
          </p>
          {locale === "ar" ? (
            <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          )}
        </Link>
      )}

      {recentOutcomes.length > 0 && (
        <Card className="overflow-hidden py-0">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <span className="text-sm font-semibold">{t("followUps.title")}</span>
          </div>
          <div className="flex flex-col">
            {recentOutcomes.slice(0, FOLLOW_UPS_LIMIT).map((decision) => (
              <Link
                key={decision.id}
                href={`/clients/${decision.client_id}?tab=decisions`}
                className="flex items-center gap-3 border-b border-border/60 px-5 py-3 last:border-0 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{decision.clients?.display_name}</p>
                </div>
                <OutcomeBadge status={decision.outcome_status as "worse" | "persisting" | "resolved" | "not_evaluable" | "pending"} />
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card className="overflow-hidden py-0">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <span className="text-sm font-semibold">{t("queue.title")}</span>
            <Link href="/forms/submissions" className="ms-auto text-xs font-medium text-primary hover:underline">
              {t("queue.viewAll")}
            </Link>
          </div>
          {!recentSubmissions || recentSubmissions.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t("queue.empty")}</p>
          ) : (
            <div className="flex flex-col">
              {recentSubmissions.map((submission) => {
                const template = submission.form_template_versions?.form_templates;
                return (
                  <Link
                    key={submission.id}
                    href={`/forms/submissions/${submission.id}`}
                    className="flex items-center gap-3 border-b border-border/60 px-5 py-3 last:border-0 hover:bg-muted/50"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {submission.clients?.display_name?.[0] ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{submission.clients?.display_name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {template ? pickLocale(template, locale) : "—"}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      {formatDate(submission.submitted_at, locale)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden py-0">
          <div className="border-b border-border px-5 py-4">
            <span className="text-sm font-semibold">{t("activity.title")}</span>
          </div>
          {notifications.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t("activity.empty")}</p>
          ) : (
            <div className="flex flex-col py-1">
              {notifications.map((notification) => {
                const payload = (notification.payload ?? {}) as Record<string, unknown>;
                const message =
                  notification.kind === "exercise_promoted" || notification.kind === "food_promoted"
                    ? tNotifications(notification.kind, { name: pickLocale(payload, locale) })
                    : tNotifications("unknown");
                return (
                  <div key={notification.id} className="flex items-start gap-3 px-5 py-2.5">
                    <div
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                        notification.read_at ? "bg-muted-foreground/40" : "bg-primary"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-foreground/90">{message}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {formatDate(notification.created_at, locale)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <OnlineClients locale={locale} clients={onlineClients.rows} />

      {periodValue && (
        <p className="text-sm text-muted-foreground">
          {t(periodLabel)}: {formatDate(periodValue, locale)}
        </p>
      )}
    </div>
  );
}
