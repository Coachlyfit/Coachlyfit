import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { startOrResumeSessionAction, listSetLogsAction } from "@/domain/workouts/workouts-actions";
import { weekIndexForDate } from "@/domain/programs/program-cycle";
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
      "*, programs(start_date), program_items(*, exercises(id, name_ar, name_en, muscle_group, video_url, cues_ar, cues_en), program_item_sets(*))"
    )
    .eq("id", programDayId)
    .order("order_index", { referencedTable: "program_items" })
    .order("set_index", { referencedTable: "program_items.program_item_sets" })
    .maybeSingle();

  if (!day) notFound();

  const session = await startOrResumeSessionAction(programDayId);
  if (!session) notFound();

  const setLogs = await listSetLogsAction(session.id);
  const today = new Date().toISOString().slice(0, 10);
  const week = day.programs ? weekIndexForDate(day.programs.start_date, today) : 1;

  return (
    <WorkoutSessionClient
      locale={locale}
      day={day}
      week={week}
      sessionId={session.id}
      initialSetLogs={setLogs}
      alreadyCompleted={session.completed_at != null}
    />
  );
}
