import { getTranslations } from "next-intl/server";
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
import type { AppLocale } from "@/domain/locale";
import { RecordPaymentDialog } from "./record-payment-dialog";

type AdminMetrics = {
  mrr_egp: number;
  active_count: number;
  trialing_count: number;
  past_due_count: number;
  canceled_count: number;
  churn_rate: number;
};

/** roleHome() has always sent admins to /{locale}/admin; until this route
 * existed that was a 404. Deliberately a plain index — the metrics dashboard
 * (admin_metrics / admin_list_coaches already exist in SQL) is its own task. */
export default async function AdminHomePage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("admin");
  const tLibrary = await getTranslations("admin.library");
  const tMetrics = await getTranslations("admin.metrics");
  const tCoaches = await getTranslations("admin.coaches");
  const supabase = await createClient();

  const [{ data: metricsData }, { data: coaches }] = await Promise.all([
    supabase.rpc("admin_metrics"),
    supabase.rpc("admin_list_coaches"),
  ]);
  const metrics = metricsData as AdminMetrics | null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {metrics && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {tMetrics("mrr")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {formatNumber(metrics.mrr_egp, locale)} EGP
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {tMetrics("churnRate")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {formatNumber(metrics.churn_rate * 100, locale, { maximumFractionDigits: 1 })}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {tMetrics("active")} / {tMetrics("trialing")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {metrics.active_count} / {metrics.trialing_count}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {tMetrics("pastDue")} / {tMetrics("canceled")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {metrics.past_due_count} / {metrics.canceled_count}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/library">
          <Card className="transition-colors hover:bg-muted/50">
            <CardContent className="flex flex-col gap-1 p-4">
              <p className="font-medium">{tLibrary("title")}</p>
              <p className="text-sm text-muted-foreground">{tLibrary("description")}</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tCoaches("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tCoaches("table.business")}</TableHead>
                <TableHead>{tCoaches("table.tier")}</TableHead>
                <TableHead>{tCoaches("table.status")}</TableHead>
                <TableHead>{tCoaches("table.clients")}</TableHead>
                <TableHead>{tCoaches("table.period")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(coaches ?? []).map((coach) => (
                <TableRow key={coach.coach_id}>
                  <TableCell className="font-medium">{coach.business_name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{coach.tier_key}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={coach.status === "active" ? "default" : "secondary"}>
                      {tCoaches(`status.${coach.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{coach.client_count}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {coach.current_period_end ? formatDate(coach.current_period_end, locale) : "—"}
                  </TableCell>
                  <TableCell>
                    <RecordPaymentDialog locale={locale} coachId={coach.coach_id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
