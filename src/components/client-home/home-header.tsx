import { getTranslations } from "next-intl/server";
import { Progress } from "@/components/ui/progress";
import { AvatarUpload } from "@/components/shared/avatar-upload";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { WeeklyProgressRing } from "@/components/progress/weekly-progress-ring";
import type { AppLocale } from "@/domain/locale";
import type { ProgramWeekProgress } from "@/domain/programs/program-cycle";
import { formatNumber } from "@/lib/format";
import { num } from "./num";

/** Dark summary card: who, this week's workouts as a ring, which week of the
 * program, and (only when the program has an end date) how far through it. */
export async function HomeHeader({
  locale,
  userId,
  name,
  avatarUrl,
  program,
  workouts,
}: {
  locale: AppLocale;
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** null = no active program. */
  program: ProgramWeekProgress | null;
  workouts: { planned: number; done: number };
}) {
  const t = await getTranslations("client.overview");
  const tToday = await getTranslations("client.today");
  const { planned, done } = workouts;

  const weekLine =
    planned === 0
      ? t("noWorkoutsPlanned")
      : done >= planned
        ? t("allDone")
        : t.rich("leftCount", { count: formatNumber(planned - done, locale), num });

  return (
    <section className="rounded-2xl bg-sidebar p-4 text-sidebar-foreground">
      <div className="flex items-center gap-3">
        <AvatarUpload userId={userId} name={name} src={avatarUrl} locale={locale} />
        <div className="flex min-w-0 flex-1 flex-col leading-snug">
          <span className="text-sm text-sidebar-foreground/70">{t("greeting")}</span>
          <span className="truncate text-lg font-semibold text-sidebar-accent-foreground">{name}</span>
        </div>
        <NotificationBell
          locale={locale}
          role="client"
          className="size-11 shrink-0 rounded-xl border-transparent bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground"
        />
      </div>

      {program ? (
        <div className="mt-4 flex items-center gap-4">
          {planned > 0 && (
            <WeeklyProgressRing
              done={done}
              total={planned}
              locale={locale}
              label={t("ringLabel")}
              ariaLabel={t("ringAria", { done: formatNumber(done, locale), total: formatNumber(planned, locale) })}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-xl font-bold text-sidebar-accent-foreground">
              {program.totalWeeks != null
                ? t.rich("weekOfTotal", {
                    n: formatNumber(program.week, locale),
                    total: formatNumber(program.totalWeeks, locale),
                    num,
                  })
                : t.rich("weekOnly", { n: formatNumber(program.week, locale), num })}
            </p>
            <p className="text-sm text-sidebar-foreground/80">{weekLine}</p>
            {program.pct != null && (
              <>
                <Progress
                  value={program.pct}
                  aria-label={t("programProgressAria")}
                  className="mt-1 gap-0 [&_[data-slot=progress-indicator]]:bg-success [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-sidebar-foreground/15"
                />
                <p className="text-xs text-sidebar-foreground/70">
                  {t.rich("programProgress", { pct: formatNumber(program.pct, locale), num })}
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm font-semibold text-sidebar-accent-foreground">{tToday("noProgram")}</p>
          <p className="mt-1 text-xs leading-relaxed text-sidebar-foreground/70">{tToday("noProgramBody")}</p>
        </div>
      )}
    </section>
  );
}
