import { getTranslations } from "next-intl/server";
import { ArrowRight, LifeBuoy } from "lucide-react";
import { Link } from "@/i18n/navigation";
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
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/format";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { PageTitle } from "@/components/dashboard/page-title";
import { getAuthUser, getRequestCoachId } from "@/lib/auth/session";
import { CancelControl, PlansAndRequests } from "./subscription-manager";

// The coach's own Coachly Fit subscription (coach -> platform money). Client
// invoices and payments are on /finance, which links here.
export default async function SubscriptionPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("billing");
  const tMethods = await getTranslations("billing.history.methods");
  const tFinance = await getTranslations("finance");
  const tSupport = await getTranslations("support");
  const supabase = await createClient();

  const [
    { data: subscription },
    { count: clientCount },
    { data: payments },
    { data: tiers },
    { data: requests },
    user,
    coachId,
  ] = await Promise.all([
    // maybeSingle: a coach can have no row at all, and that is a state the
    // page has to explain rather than an error to swallow.
    supabase
      .from("subscriptions")
      .select(
        "status, tier_id, trial_ends_at, current_period_end, cancel_at_period_end, subscription_tiers(name_ar, name_en, price_egp_monthly, max_clients)"
      )
      .maybeSingle(),
    supabase.from("clients").select("id", { count: "exact", head: true }).neq("status", "archived"),
    supabase.from("payments").select("*").order("created_at", { ascending: false }),
    supabase
      .from("subscription_tiers")
      .select("id, name_ar, name_en, price_egp_monthly, max_clients, max_team_members")
      .order("price_egp_monthly"),
    supabase
      .from("subscription_requests")
      .select("id, type, note, status, admin_response, created_at, subscription_tiers(name_ar, name_en)")
      .order("created_at", { ascending: false })
      .limit(20),
    getAuthUser(),
    getRequestCoachId(),
  ]);

  // Only the tenant owner manages the subscription; a team member sees it.
  const isOwner = !!user && user.id === coachId;
  const tier = subscription?.subscription_tiers;
  const canceled = subscription?.status === "canceled";
  const cancelScheduled = !!subscription?.cancel_at_period_end && !canceled;
  const periodValue =
    subscription?.status === "trialing" ? subscription.trial_ends_at : subscription?.current_period_end;
  const periodLabel = cancelScheduled ? "endsAt" : subscription?.status === "trialing" ? "trialEndsAt" : "renewsAt";

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const paidThisMonth = (payments ?? [])
    .filter((p) => new Date(p.created_at) >= monthStart)
    .reduce((sum, p) => sum + p.amount_egp, 0);
  const totalPaid = (payments ?? []).reduce((sum, p) => sum + p.amount_egp, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("title")} />
      <Link
        href="/finance"
        className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowRight className="size-4 rotate-180 rtl:rotate-0" aria-hidden="true" />
        {tFinance("subscription.back")}
      </Link>
      {/* The one way to support while the account is locked: the nav is
          hidden then, and the (coach) layout lets /support through. */}
      {isOwner && (
        <Link
          href="/support"
          className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <LifeBuoy className="size-4" aria-hidden="true" />
          {tSupport("contactSupport")}
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              {t("paidThisMonth")}
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{formatNumber(paidThisMonth, locale)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              {t("totalPaid")}
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{formatNumber(totalPaid, locale)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("currentPlan")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold">{tier ? pickLocale(tier, locale) : "—"}</span>
            {subscription && (
              <Badge variant={subscription.status === "active" ? "default" : "secondary"}>
                {t(`status.${subscription.status}`)}
              </Badge>
            )}
          </div>
          {tier && <p className="text-sm text-muted-foreground">{t("priceMonthly", { price: tier.price_egp_monthly })}</p>}
          {tier && (
            <p className="text-sm text-muted-foreground">
              {tier.max_clients == null
                ? t("clientLimitUnlimited", { count: clientCount ?? 0 })
                : t("clientLimit", { count: clientCount ?? 0, max: tier.max_clients })}
            </p>
          )}
          {!subscription && <p className="text-sm text-muted-foreground">{t("noSubscription")}</p>}
          {periodValue && !canceled && (
            <p className="text-sm text-muted-foreground">
              {t(periodLabel)}: {formatDate(periodValue, locale)}
            </p>
          )}
          {subscription?.status === "past_due" && (
            <p className="text-sm text-warning-tint-foreground">{t("pastDueNotice")}</p>
          )}
          {subscription?.status === "canceled" && (
            <p className="text-sm text-destructive">{t("canceledNotice")}</p>
          )}
          {cancelScheduled && (
            <p className="text-sm text-warning-tint-foreground">
              {periodValue
                ? t("cancelScheduledNotice", { date: formatDate(periodValue, locale) })
                : t("cancelScheduledNoDate")}
            </p>
          )}
          {subscription && !canceled && isOwner && (
            <CancelControl
              locale={locale}
              cancelAtPeriodEnd={subscription.cancel_at_period_end}
              periodEnd={periodValue ?? null}
            />
          )}
        </CardContent>
      </Card>

      <PlansAndRequests
        locale={locale}
        tiers={(tiers ?? []).map((row) => ({
          id: row.id,
          name: pickLocale(row, locale),
          price: row.price_egp_monthly,
          maxClients: row.max_clients,
          maxTeamMembers: row.max_team_members,
        }))}
        currentTierId={canceled ? null : (subscription?.tier_id ?? null)}
        canceled={canceled}
        isOwner={isOwner}
        requests={(requests ?? []).map((row) => ({
          id: row.id,
          type: row.type,
          tierName: row.subscription_tiers ? pickLocale(row.subscription_tiers, locale) : null,
          note: row.note,
          status: row.status,
          adminResponse: row.admin_response,
          createdAt: row.created_at,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("history.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!payments || payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("history.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("history.table.date")}</TableHead>
                  <TableHead>{t("history.table.amount")}</TableHead>
                  <TableHead>{t("history.table.method")}</TableHead>
                  <TableHead>{t("history.table.period")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="tabular-nums">{formatDate(payment.created_at, locale)}</TableCell>
                    <TableCell className="tabular-nums">{payment.amount_egp} EGP</TableCell>
                    <TableCell>{tMethods(payment.method)}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatDate(payment.period_start, locale)} – {formatDate(payment.period_end, locale)}
                    </TableCell>
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
