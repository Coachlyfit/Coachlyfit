import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  startOrResumeSessionAction,
  listSetLogsAction,
  listExerciseResultsAction,
  getLastPerformanceAction,
} from "@/domain/workouts/workouts-actions";
import { weekIndexForDate } from "@/domain/programs/program-cycle";
import { CLIENT_SAFE_ITEM_COLUMNS } from "@/domain/programs/programs.service";
import { LedgerService } from "@/domain/ledger/ledger.service";
import type { AppLocale } from "@/domain/locale";
import { WorkoutSessionClient } from "./workout-session-client";

// Route param is a program_day id — the "session" is started/resumed
// lazily on load, matching how Today/Plan link straight to the day rather
// than pre-creating a session row before the client ever opens it.
export default async function WorkoutSessionPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; sessionId: string }>;
}) {
  const { locale, sessionId: programDayId } = await params;
  const supabase = await createClient();

  const { data: day } = await supabase
    .from("program_days")
    .select(
      // program_items is an explicit column list, not `*` — must never
      // include coach_note_private (a coach-only prescription annotation)
      // on a route the client's browser directly receives the response
      // for. See CLIENT_SAFE_ITEM_COLUMNS's doc comment.
      `*, programs(start_date), program_items(${CLIENT_SAFE_ITEM_COLUMNS}, exercises(id, name_ar, name_en, muscle_group, video_url, image_url, thumbnail_url, cues_ar, cues_en, steps_ar, steps_en, mistakes_ar, mistakes_en, safety_ar, safety_en, tempo), program_item_sets(*))`
    )
    .eq("id", programDayId)
    .order("order_index", { referencedTable: "program_items" })
    .order("set_index", { referencedTable: "program_items.program_item_sets" })
    .maybeSingle();

  if (!day) notFound();

  const session = await startOrResumeSessionAction(programDayId);
  if (!session) notFound();

  const [setLogs, exerciseResults, adjustedItemReasons] = await Promise.all([
    listSetLogsAction(session.id),
    listExerciseResultsAction(session.id),
    new LedgerService(supabase).listActiveAdjustedItemIds(session.client_id),
  ]);
  const exerciseIds = day.program_items.map((item) => item.exercises.id);
  const lastPerformance = await getLastPerformanceAction(exerciseIds);
  const today = new Date().toISOString().slice(0, 10);
  const week = day.programs ? weekIndexForDate(day.programs.start_date, today) : 1;

  return (
    <WorkoutSessionClient
      locale={locale}
      day={day}
      week={week}
      sessionId={session.id}
      initialSetLogs={setLogs}
      initialExerciseResults={exerciseResults}
      lastPerformance={lastPerformance}
      alreadyCompleted={session.completed_at != null}
      initialElapsedSeconds={session.elapsed_seconds}
      adjustedItemReasons={Object.fromEntries(adjustedItemReasons)}
    />
  );
}
