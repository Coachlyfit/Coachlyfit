import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dumbbell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsService } from "@/domain/workouts/workouts.service";
import { pickLocale, pickBilingual, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";

/** Coach-facing compliance view — sits alongside ProgressSection on the
 * client detail page. Read-only: RLS's coach_read (select-only) on
 * workout_sessions/workout_set_logs already scopes this to the caller's
 * own clients, no separate authorization needed here. */
export async function WorkoutSection({ clientId, locale }: { clientId: string; locale: AppLocale }) {
  const t = await getTranslations("clients.workouts");
  const supabase = await createClient();
  const sessions = await new WorkoutsService(supabase).listRecentSessions(clientId);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
      {sessions.length === 0 ? (
        <EmptyState icon={Dumbbell} title={t("empty")} />
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => {
            const label = session.program_days
              ? pickLocale(session.program_days, locale, "label")
              : "";
            const done = session.completed_at != null;
            return (
              <Card key={session.id}>
                <CardContent className="flex flex-col gap-1.5 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{label || t("title")}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(session.started_at, locale, { dateStyle: "medium" })}
                      </p>
                    </div>
                    <span className={done ? "text-sm text-success" : "text-sm text-muted-foreground"}>
                      {done ? t("completed") : t("inProgress")}
                    </span>
                  </div>
                  {session.swaps.map((swap, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {t("swapped", {
                        original: pickBilingual(swap.original, locale),
                        substitute: pickBilingual(swap.substitute, locale),
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
