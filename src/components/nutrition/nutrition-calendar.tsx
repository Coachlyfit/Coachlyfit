import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { addDays, leadingBlanks, type DayStatus } from "@/domain/nutrition/adherence";

const STATUS_CLASS: Record<DayStatus, string> = {
  logged: "bg-primary/15 text-foreground",
  off_plan: "bg-amber-500/20 text-foreground ring-1 ring-amber-500/60",
  missed: "bg-muted text-muted-foreground",
  future: "text-muted-foreground/60",
};

const LEGEND: Exclude<DayStatus, "future">[] = ["logged", "off_plan", "missed"];

/** Month grid of logging status: logged, off-plan (highlighted), missed.
 * Weeks start Saturday in Arabic and Sunday in English. Month navigation
 * is plain links (`prevHref`/`nextHref`), so it works as a Server
 * Component with no client state. */
export function NutritionCalendar({
  month,
  days,
  locale,
  prevHref,
  nextHref,
}: {
  month: string;
  days: { date: string; status: DayStatus; kcal?: number | null }[];
  locale: AppLocale;
  prevHref: string;
  nextHref: string | null;
}) {
  const t = useTranslations("nutrition.calendar");
  const weekStart = locale === "ar" ? 6 : 0;
  const blanks = days.length > 0 ? leadingBlanks(days[0].date, weekStart) : 0;
  // Any week works as a reference for weekday names; 2026-01-04 is a Sunday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    formatDate(addDays("2026-01-04", (weekStart + i) % 7), locale, { weekday: "narrow", timeZone: "UTC" })
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon-sm" aria-label={t("prev")} nativeButton={false} render={<Link href={prevHref} scroll={false} />}>
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </Button>
        <p className="text-sm font-medium">
          {formatDate(`${month}-01`, locale, { month: "long", year: "numeric", timeZone: "UTC" })}
        </p>
        {nextHref ? (
          <Button variant="ghost" size="icon-sm" aria-label={t("next")} nativeButton={false} render={<Link href={nextHref} scroll={false} />}>
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Button>
        ) : (
          <span className="size-8" />
        )}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {weekdays.map((w, i) => (
          <span key={i} className="pb-1 text-muted-foreground">
            {w}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {days.map((day) => (
          <span
            key={day.date}
            title={day.kcal ? `${day.kcal} kcal` : undefined}
            aria-label={`${formatDate(day.date, locale, { timeZone: "UTC" })}: ${
              day.status === "future" ? "" : t(`legend.${day.status}`)
            }`}
            className={cn("flex aspect-square items-center justify-center rounded-md tabular-nums", STATUS_CLASS[day.status])}
          >
            {Number(day.date.slice(8))}
          </span>
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {LEGEND.map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded-sm", STATUS_CLASS[status])} />
            {t(`legend.${status}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
