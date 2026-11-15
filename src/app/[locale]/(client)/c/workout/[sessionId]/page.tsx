import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  listSetLogsAction,
  listExerciseResultsAction,
  getLastPerformanceAction,
} from "@/domain/workouts/workouts-actions";
import { WorkoutsService } from "@/domain/workouts/workouts.service";
import { workoutEntry } from "@/domain/workouts/session-entry";
import { weekIndexForDate, startOfWeekSaturday } from "@/domain/programs/program-cycle";
import { CLIENT_SAFE_ITEM_COLUMNS } from "@/domain/programs/programs.service";
import { activePhase } from "@/domain/programs/day-plan";
import { sortItemsBySections } from "@/domain/programs/day-sections";
import { LedgerService } from "@/domain/ledger/ledger.service";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { parseBlockResults } from "@/domain/workouts/block-result";
import { parseWeekPlan } from "@/domain/programs/week-plan";
import { WorkoutSessionClient } from "./workout-session-client";
import { WorkoutPreview } from "./workout-preview";

// Route param is a program_day id. Opening it shows a preview; the session
// (and its timer) only exists once the client taps "Start workout".
export default async function WorkoutSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale; sessionId: string }>;
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const { locale, sessionId: programDayId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: day } = await supabase
    .from("program_days")
    .select(
      // program_items is an explicit column list, not `*` — must never
      // include coach_note_private (a coach-only prescription annotation)
      // on a route the client's browser directly receives the response
      // for. See CLIENT_SAFE_ITEM_COLUMNS's doc comment.
      `*, programs(start_date, id, week_plan), program_items(${CLIENT_SAFE_ITEM_COLUMNS}, exercises(id, name_ar, name_en, muscle_group, video_url, image_url, thumbnail_url, cues_ar, cues_en, steps_ar, steps_en, mistakes_ar, mistakes_en, safety_ar, safety_en, tempo, measurement_type), program_item_sets(*))`
    )
    .eq("id", programDayId)
    .order("order_index", { referencedTable: "program_items" })
    .order("set_index", { referencedTable: "program_items.program_item_sets" })
    .maybeSingle();

  if (!day) notFound();

  // Opening a day never creates a session: it shows a preview, and only the
  // preview's "Start workout" button starts one. A session already in
  // progress (on any day) is resumed instead — never two at once.
  const today = new Date().toISOString().slice(0, 10);
  const workouts = new WorkoutsService(supabase);
  const [active, weekSession] = await Promise.all([
    day.client_id ? workouts.getActiveSession(day.client_id) : null,
    workouts.getSessionForDay(programDayId, startOfWeekSaturday(today)),
  ]);
  const entry = workoutEntry({ programDayId, active, weekSession, view: sp.view });
  if (entry.kind === "redirect") redirect({ href: `/c/workout/${entry.dayId}`, locale });
  const session = entry.kind === "runner" ? (active?.program_day_id === programDayId ? active : weekSession) : null;
  if (entry.kind === "runner" && !session) notFound();
  const week = day.programs ? weekIndexForDate(day.programs.start_date, today) : 1;

  // A rehab item (block='rehab') tied to a phase only shows while that
  // phase is active for this week — same rule as day-plan.ts's
  // resolveDayPlan, applied here directly since the session runner reads
  // program_items straight off this route rather than through a full
  // ProgramTree. An item with no phase (rehab_phase_id null) always shows.
  const { data: protocols } = day.programs
    ? await supabase
        .from("rehab_protocols")
        .select("id, rehab_phases(id, from_week, to_week)")
        .eq("program_id", day.programs.id)
    : { data: [] };
  const activePhaseIds = new Set(
    (protocols ?? [])
      .map((p) => activePhase(p as never, week)?.id)
      .filter((id): id is string => id != null)
  );
  const visibleItems = day.program_items.filter(
    (item) => item.block !== "rehab" || item.rehab_phase_id == null || activePhaseIds.has(item.rehab_phase_id)
  );
  // Walk the day in the coach's section order (e.g. Mobility & rehab before
  // the main workout) so the session runner starts where the builder shows.
  const visibleDay = { ...day, program_items: sortItemsBySections(visibleItems, day.section_order) };

  if (!session) {
    return (
      <WorkoutPreview
        locale={locale}
        dayId={programDayId}
        label={day.label_ar || day.label_en ? pickLocale(day, locale, "label") : null}
        items={visibleDay.program_items}
        scheduledDate={sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date !== today ? sp.date : null}
        doneOn={weekSession?.completed_at ? weekSession.started_at.slice(0, 10) : null}
      />
    );
  }

  const [setLogs, exerciseResults, adjustedItemReasons] = await Promise.all([
    listSetLogsAction(session.id),
    listExerciseResultsAction(session.id),
    new LedgerService(supabase).listActiveAdjustedItemIds(session.client_id),
  ]);
  const lastPerformance = await getLastPerformanceAction(
    day.program_items.map((item) => item.exercises.id),
    session.id
  );

  return (
    <WorkoutSessionClient
      locale={locale}
      day={visibleDay}
      week={week}
      weekPlan={parseWeekPlan(day.programs?.week_plan)}
      sessionId={session.id}
      initialSetLogs={setLogs}
      initialExerciseResults={exerciseResults}
      lastPerformance={lastPerformance}
      alreadyCompleted={session.completed_at != null}
      initialElapsedSeconds={session.elapsed_seconds}
      initialItemId={session.current_item_id}
      initialBlockResults={parseBlockResults(session.block_results)}
      adjustedItemReasons={Object.fromEntries(adjustedItemReasons)}
    />
  );
}
