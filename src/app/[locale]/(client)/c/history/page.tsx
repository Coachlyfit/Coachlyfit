import { getTranslations } from "next-intl/server";
import { Dumbbell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsService } from "@/domain/workouts/workouts.service";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Past sessions with their computed summary (total volume, sets done vs
 * prescribed) — reuses the same listRecentSessions the coach's client-detail
 * WorkoutSection already calls; RLS's client_own already scopes it to the
 * caller's own sessions when they pass their own client id, same as every
 * other client-authored-data read in this app. */
export default async function ClientHistoryPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("client.history");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: clientRow } = await supabase.from("clients").select("id").eq("profile_id", user!.id).single();

  const sessions = clientRow ? await new WorkoutsService(supabase).listRecentSessions(clientRow.id, 30) : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {sessions.length === 0 ? (
        <EmptyState icon={Dumbbell} title={t("empty")} />
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => {
            const label = session.program_days ? pickLocale(session.program_days, locale, "label") : "";
            const done = session.completed_at != null;
            return (
              <Card key={session.id}>
                <CardContent className="flex flex-col gap-1.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{label || t("workout")}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(session.started_at, locale, { dateStyle: "medium" })}
                      </p>
                    </div>
                    <span className={cn("shrink-0 text-sm", done ? "text-success" : "text-muted-foreground")}>
                      {done ? t("completed") : t("inProgress")}
                    </span>
                  </div>
                  {done && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {session.sets_completed != null && (
                        <span>
                          {t("setsDone", {
                            done: session.sets_completed,
                            total: session.sets_prescribed ?? session.sets_completed,
                          })}
                        </span>
                      )}
                      {session.total_volume != null && session.total_volume > 0 && (
                        <span>{t("volume", { value: formatNumber(session.total_volume, locale, { maximumFractionDigits: 0 }) })}</span>
                      )}
                      {session.duration_seconds != null && (
                        <span>{t("duration", { minutes: Math.round(session.duration_seconds / 60) })}</span>
                      )}
                    </div>
                  )}
                  {session.swaps.map((swap, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {t("swapped", {
                        original: locale === "ar" ? swap.original.ar : swap.original.en,
                        substitute: locale === "ar" ? swap.substitute.ar : swap.substitute.en,
                      })}
                    </p>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
