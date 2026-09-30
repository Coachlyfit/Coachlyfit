import { useTranslations } from "next-intl";
import { CircleOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";

export type OffPlanReport = {
  id: string;
  date: string;
  meal: string | null;
  note: string | null;
  kcal: number | null;
  photoUrl: string | null;
};

/** A client's off-plan reports, newest first. The photo URL is already
 * signed by the caller (private progress-media bucket). */
export function OffPlanList({ reports, locale }: { reports: OffPlanReport[]; locale: AppLocale }) {
  const t = useTranslations("nutrition.offPlan");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("reportsTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <EmptyState icon={CircleOff} title={t("empty")} />
        ) : (
          <ul className="flex flex-col divide-y">
            {reports.map((r) => (
              <li key={r.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                {r.photoUrl && (
                  <a href={r.photoUrl} target="_blank" rel="noreferrer" className="shrink-0">
                    <img src={r.photoUrl} alt={t("photoAlt")} className="size-16 rounded-md object-cover" />
                  </a>
                )}
                <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                  <p className="font-medium">
                    {formatDate(r.date, locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                    {r.meal && <span className="text-muted-foreground"> · {r.meal}</span>}
                  </p>
                  {r.kcal != null && (
                    <p className="text-xs text-muted-foreground">{t("estimatedKcal", { kcal: formatNumber(r.kcal, locale) })}</p>
                  )}
                  {r.note && <p className="text-muted-foreground break-words">{r.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
