import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { ProgramsService, type ProgramScope } from "@/domain/programs/programs.service";
import { startOfWeekSaturday, weekIndexForDate } from "@/domain/programs/program-cycle";
import { isTrainingDay, programStatus, weekCells, type WeekCell } from "@/domain/programs/week-status";
import { addDays } from "@/domain/nutrition/adherence";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import { PageTitle } from "@/components/dashboard/page-title";
import { StarterPlansDialog } from "./starter-plans-dialog";
import { CreateProgramDialog } from "./create-program-dialog";
import { ProgramsTrashButton } from "./programs-trash-button";
import { ProgramsClient, type ProgramsView } from "./programs-client";
import type { AssignedRow, Cell, TemplateRow } from "./program-cards";

export default async function ProgramsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ view?: string; scope?: string; week?: string; client?: string }>;
}) {
  const { locale } = await params;
  const { view: rawView, scope: rawScope, week: rawWeek, client: defaultClientId } = await searchParams;
  // Unknown values from a hand-edited URL fall back to the default, not an error.
  const view: ProgramsView = rawView === "week" ? "week" : "cards";
  const scope: ProgramScope = rawScope === "templates" ? "templates" : rawScope === "assigned" ? "assigned" : "all";
  const t = await getTranslations("programs");
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  const currentWeek = startOfWeekSaturday(today);
  const weekStart =
    view === "week" && rawWeek && /^\d{4}-\d{2}-\d{2}$/.test(rawWeek) ? startOfWeekSaturday(rawWeek) : currentWeek;

  // One range covering both the current week (header summary, status badges,
  // card strips) and the navigated one (the grid), so it stays one query.
  // ponytail: a week far in the past pulls every session in between; fetch
  // the two weeks separately if that span ever gets heavy.
  const [{ data: clients }, programs] = await Promise.all([
    supabase.from("clients").select("id, display_name").neq("status", "archived"),
    new ProgramsService(supabase).listOverview(
      weekStart < currentWeek ? weekStart : currentWeek,
      addDays(weekStart > currentWeek ? weekStart : currentWeek, 7)
    ),
  ]);

  const cell = (c: WeekCell): Cell => ({
    date: c.date,
    status: c.status,
    label: pickLocale(c, locale, "label") || null,
  });

  const usedBy = new Map<string, number>();
  const assigned: AssignedRow[] = [];
  const templates: TemplateRow[] = [];
  let active = 0;
  let missed = 0;

  for (const program of programs) {
    const trainingDays = program.program_days.filter(isTrainingDay);
    if (!program.client_id) {
      templates.push({
        id: program.id,
        name: pickLocale(program, locale),
        split: trainingDays.map((d) => pickLocale(d, locale, "label") || formatNumber(d.day_index, locale)),
        exercises: trainingDays.reduce((sum, d) => sum + d.program_items[0].count, 0),
        usedBy: 0,
        planType: program.plan_type,
        goal: program.goal,
        level: program.level,
      });
      continue;
    }

    if (program.source_template_id) {
      usedBy.set(program.source_template_id, (usedBy.get(program.source_template_id) ?? 0) + 1);
    }
    const cells = weekCells(program, currentWeek, today);
    const status = programStatus(program.start_date, cells, today);
    if (status !== "notStarted" && (!program.end_date || program.end_date >= today)) active++;
    missed += cells.filter((c) => c.status === "missed").length;

    assigned.push({
      id: program.id,
      clientId: program.client_id,
      // A former client's row is unreadable after a coach switch, so the join
      // can be null on an assigned program.
      client: program.clients?.display_name ?? "—",
      name: pickLocale(program, locale),
      planType: program.plan_type,
      goal: program.goal,
      level: program.level,
      status,
      startDate: program.start_date,
      // Uncapped: the 12-week default is progression.ts's ceiling, not the calendar's.
      weekNo: weekIndexForDate(program.start_date, today, Infinity),
      trainingDays: trainingDays.length,
      cells: cells.map(cell),
      viewCells: (weekStart === currentWeek ? cells : weekCells(program, weekStart, today)).map(cell),
    });
  }
  for (const template of templates) template.usedBy = usedBy.get(template.id) ?? 0;

  const strong = (chunks: React.ReactNode) => (
    <span dir="ltr" className="font-mono font-semibold text-foreground tabular-nums">
      {chunks}
    </span>
  );

  return (
    <div className="flex flex-col gap-5 max-md:pb-16">
      <PageTitle title={t("title")} />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl leading-9 font-semibold">{t("heading")}</h1>
          {assigned.length > 0 && (
            <p className="text-base text-muted-foreground">
              {t.rich("summary", {
                active: formatNumber(active, locale),
                activeCount: active,
                missed: formatNumber(missed, locale),
                missedCount: missed,
                strong,
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ProgramsTrashButton locale={locale} />
          <StarterPlansDialog locale={locale} />
          {/* Pinned above the bottom nav on mobile (end-20 clears the feedback
              widget), inline from md up. */}
          <CreateProgramDialog
            locale={locale}
            clients={clients ?? []}
            defaultClientId={defaultClientId}
            defaultOpen={!!defaultClientId}
            triggerClassName="max-md:fixed max-md:start-4 max-md:end-20 max-md:bottom-[calc(var(--bottom-nav-h)+0.75rem)] max-md:z-30 max-md:h-13 max-md:text-base max-md:shadow-lg"
          />
        </div>
      </header>

      {programs.length === 0 ? (
        <Card>
          <EmptyState brandMark title={t("empty.title")} description={t("empty.description")} />
        </Card>
      ) : (
        <ProgramsClient
          locale={locale}
          view={view}
          scope={scope}
          week={weekStart === currentWeek ? null : weekStart}
          weekStart={weekStart}
          today={today}
          assigned={assigned}
          templates={templates}
          clients={clients ?? []}
        />
      )}
    </div>
  );
}
