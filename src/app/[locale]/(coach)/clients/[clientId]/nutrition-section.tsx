import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NutritionCalendar } from "@/components/nutrition/nutrition-calendar";
import { OffPlanList } from "@/components/nutrition/off-plan-list";
import { NutritionLogsService } from "@/domain/nutrition/nutrition-logs.service";
import { ProgressService } from "@/domain/progress/progress.service";
import { addDays, dayStatuses, monthRange, nutritionAdherence, shiftMonth } from "@/domain/nutrition/adherence";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";

const WINDOW_DAYS = 30;

/** Client intake logging for the coach: 30-day adherence (off-plan days
 * count as logged — reporting one is keeping the log), a month calendar
 * with off-plan days highlighted, and that month's off-plan reports. */
export async function NutritionSection({
  clientId,
  month,
  locale,
}: {
  clientId: string;
  month: string;
  locale: AppLocale;
}) {
  const t = await getTranslations("nutrition.adherence");
  const tCalendar = await getTranslations("nutrition.calendar");
  const supabase = await createClient();
  const service = new NutritionLogsService(supabase);

  const today = new Date().toISOString().slice(0, 10);
  const calendar = monthRange(month);
  const windowFrom = addDays(today, -(WINDOW_DAYS - 1));
  // Fetch one span covering both the adherence window and the shown month,
  // plus the 60 days before it so the current streak can run back past the window.
  const fetchFrom = [calendar.from, addDays(windowFrom, -60)].sort()[0];
  const fetchTo = [calendar.to, today].sort()[1];

  const [logs, startedOn] = await Promise.all([
    service.listLogs(clientId, fetchFrom, fetchTo),
    service.coachingStartDate(clientId),
  ]);

  const stats = nutritionAdherence(logs, {
    from: startedOn && startedOn > windowFrom ? startedOn : windowFrom,
    to: today,
  });
  const monthLogs = logs.filter((l) => l.log_date >= calendar.from && l.log_date <= calendar.to);
  const kcalByDate = new Map(monthLogs.map((l) => [l.log_date, l.kcal]));
  const days = dayStatuses(monthLogs, calendar, today).map((d) => ({ ...d, kcal: kcalByDate.get(d.date) }));

  const offPlan = monthLogs.filter((l) => l.off_plan).reverse();
  const signed = await new ProgressService(supabase).signMediaUrls(
    offPlan.map((l) => l.off_plan_photo_path).filter((p): p is string => p != null)
  );

  const base = `/clients/${clientId}?tab=nutrition`;
  const tiles = [
    {
      label: t("logged"),
      value: t("loggedValue", { logged: stats.loggedDays, total: stats.totalDays }),
      hint: stats.rate != null ? `${formatNumber(stats.rate, locale)}%` : null,
    },
    { label: t("currentStreak"), value: t("days", { count: stats.currentStreak }), hint: null },
    { label: t("longestStreak"), value: t("days", { count: stats.longestStreak }), hint: null },
    { label: t("offPlanDays"), value: formatNumber(stats.offPlanDays, locale), hint: null },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{t("window", { days: WINDOW_DAYS })}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <Card key={tile.label} size="sm">
              <CardContent className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">{tile.label}</span>
                <span className="text-lg font-semibold tabular-nums">{tile.value}</span>
                {tile.hint && <span className="text-xs text-muted-foreground">{tile.hint}</span>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tCalendar("title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <NutritionCalendar
              month={month}
              days={days}
              locale={locale}
              prevHref={`${base}&month=${shiftMonth(month, -1)}`}
              nextHref={month < today.slice(0, 7) ? `${base}&month=${shiftMonth(month, 1)}` : null}
            />
          </CardContent>
        </Card>

        <OffPlanList
          locale={locale}
          reports={offPlan.map((l) => ({
            id: l.id,
            date: l.log_date,
            meal: l.off_plan_meal,
            note: l.off_plan_note,
            kcal: l.off_plan_kcal,
            photoUrl: l.off_plan_photo_path ? (signed.get(l.off_plan_photo_path) ?? null) : null,
          }))}
        />
      </div>
    </div>
  );
}
