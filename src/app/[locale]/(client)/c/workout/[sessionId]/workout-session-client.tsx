"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, ChevronLeft, Play } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ApertureSweep } from "@/components/brand/aperture-sweep";
import { ExerciseVideoSheet } from "@/components/workout/exercise-video-sheet";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { Database } from "@/lib/supabase/database.types";
import { logSetAction, completeSessionAction } from "@/domain/workouts/workouts-actions";
import { projectSetsForWeek, type ProgressionRule } from "@/domain/programs/progression";
import { cn } from "@/lib/utils";

type ProgramItemSetRow = Database["public"]["Tables"]["program_item_sets"]["Row"];
type ProgramItem = Database["public"]["Tables"]["program_items"]["Row"] & {
  exercises: Pick<
    Database["public"]["Tables"]["exercises"]["Row"],
    "id" | "name_ar" | "name_en" | "muscle_group" | "video_url" | "cues_ar" | "cues_en"
  >;
  program_item_sets: ProgramItemSetRow[]; // must already be ordered by set_index
};
type ProgramDay = Database["public"]["Tables"]["program_days"]["Row"] & { program_items: ProgramItem[] };
type WorkoutSetLog = Database["public"]["Tables"]["workout_set_logs"]["Row"];

/** min-max reps across a projected set list, formatted like the old
 * program_items.reps range string ("8-12" or "10") — display-only, purely
 * cosmetic continuity with the previous header line. */
function repsRangeLabel(sets: { reps: number }[]): string {
  if (sets.length === 0) return "";
  const reps = sets.map((s) => s.reps);
  const min = Math.min(...reps);
  const max = Math.max(...reps);
  return min === max ? String(min) : `${min}-${max}`;
}

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Sets are keyed by `${program_item_id}-${set_index}` for the in-memory
// done/weight/reps state, mirroring the design's own `xi + '-' + i` key —
// the pattern is sound, this just replays it against real logged rows
// instead of local-only React state.
function setKey(programItemId: string, setIndex: number): string {
  return `${programItemId}-${setIndex}`;
}

export function WorkoutSessionClient({
  locale,
  day,
  week,
  sessionId,
  initialSetLogs,
  alreadyCompleted,
}: {
  locale: AppLocale;
  day: ProgramDay;
  /** Which week's progression to project — see program-cycle.ts's
   * weekIndexForDate, resolved server-side from the program's start_date. */
  week: number;
  sessionId: string;
  initialSetLogs: WorkoutSetLog[];
  alreadyCompleted: boolean;
}) {
  const t = useTranslations("client.workout");
  const router = useRouter();
  const BackIcon = locale === "ar" ? ChevronRight : ChevronLeft;

  const [logs, setLogs] = useState(() => {
    const map = new Map<string, WorkoutSetLog>();
    for (const log of initialSetLogs) map.set(setKey(log.program_item_id, log.set_index), log);
    return map;
  });
  const [elapsedS, setElapsedS] = useState(0);
  const [restS, setRestS] = useState(0);
  const [done, setDone] = useState(alreadyCompleted);
  const [videoExercise, setVideoExercise] = useState<ProgramItem["exercises"] | null>(null);
  const [restDuration, setRestDuration] = useState(90);

  const projectedByItem = new Map(
    day.program_items.map((item) => [
      item.id,
      projectSetsForWeek(item.program_item_sets, item.progression_rule as ProgressionRule, week),
    ])
  );
  const totalSets = day.program_items.reduce((sum, item) => sum + item.program_item_sets.length, 0);
  const doneCount = logs.size;
  const allDone = totalSets > 0 && doneCount === totalSets;

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      setElapsedS((s) => s + 1);
      setRestS((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [done]);

  async function toggleSet(item: ProgramItem, setIndex: number, prescribedReps: number) {
    const key = setKey(item.id, setIndex);
    if (logs.has(key)) return; // sets are logged once, not un-toggled — matches server-authored history
    const log = await logSetAction(sessionId, {
      program_item_id: item.id,
      set_index: setIndex,
      reps: prescribedReps,
    });
    if (!log) return;
    setLogs((prev) => new Map(prev).set(key, log));
    const duration = item.rest_seconds ?? 90;
    setRestDuration(duration);
    setRestS(duration);
  }

  async function onFinish() {
    await completeSessionAction(sessionId, elapsedS);
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#0F172A] px-8 py-10 text-center text-[#E2E8F0]">
        <ApertureSweep size={104} className="text-[#E2E8F0]" />
        <div>
          <p className="text-xl font-semibold text-[#F8FAFC]">{t("finishDone")}</p>
          <p className="mt-2.5 max-w-xs text-[13.5px] leading-relaxed text-[#94A3B8]">
            {t("doneBody", { sets: doneCount, duration: mmss(elapsedS) })}
          </p>
        </div>
        <Link
          href="/c"
          className="flex h-12 items-center rounded-[11px] border border-[#334155] px-7 text-sm font-semibold text-[#E2E8F0]"
        >
          {t("close")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#020617] text-[#E2E8F0]">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 pt-14.5 pb-3.5">
        <button
          type="button"
          onClick={() => router.push("/c")}
          aria-label={t("close")}
          className="flex size-11 -ms-3 shrink-0 items-center justify-center text-[#94A3B8]"
        >
          <BackIcon className="size-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-[#F8FAFC]">
            {day.label_ar || day.label_en ? pickLocale(day, locale, "label") : t("todayWorkout")}
          </p>
          <p className="mt-0.5 font-mono text-[10.5px] text-[#64748B]">{t("setsDone", { done: doneCount, total: totalSets })}</p>
        </div>
        <p className="shrink-0 font-mono text-[17px] font-semibold text-[#EA580C]">{mmss(elapsedS)}</p>
      </div>

      {restS > 0 && (
        <div className="flex items-center gap-3.5 bg-primary px-5 py-3.5">
          <p className="font-mono text-xl font-semibold text-primary-foreground">{mmss(restS)}</p>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-primary-foreground/25">
            <div
              className="h-full bg-primary-foreground"
              style={{ width: `${(restS / restDuration) * 100}%` }}
            />
          </div>
          <button
            type="button"
            onClick={() => setRestS(0)}
            className="shrink-0 px-1 text-xs font-semibold text-primary-foreground"
          >
            {t("skipRest")}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3.5 px-5 py-4">
        {day.program_items.map((item) => {
          const displaySets = projectedByItem.get(item.id) ?? [];
          return (
          <div key={item.id} className="rounded-2xl bg-[#0F172A] p-4">
            <div className="mb-3.5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setVideoExercise(item.exercises)}
                className="relative flex size-none h-13.5 w-19.5 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-[repeating-linear-gradient(135deg,#131C2F_0_7px,#1B2437_7px_14px)]"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-[#F8FAFC]/95">
                  <Play className="size-3 fill-[#0F172A] text-[#0F172A] ms-0.5" aria-hidden="true" />
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold text-[#F8FAFC]">
                  {pickLocale(item.exercises, locale)}
                </p>
                <div className="mt-1 flex items-center gap-2.5">
                  <span className="font-mono text-[11px] text-[#64748B]">
                    {displaySets.length} × {repsRangeLabel(displaySets)}
                  </span>
                  {item.exercises.video_url && (
                    <button
                      type="button"
                      onClick={() => setVideoExercise(item.exercises)}
                      className="text-[11.5px] font-medium text-primary"
                    >
                      {t("watchForm")}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2.5">
              {displaySets.map((set, i) => {
                const log = logs.get(setKey(item.id, i));
                const on = log != null;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleSet(item, i, set.reps)}
                    disabled={on}
                    className={cn(
                      "flex h-13 flex-1 flex-col items-center justify-center gap-0.5 rounded-[10px] border-[1.5px]",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-[#1E293B] text-[#64748B]"
                    )}
                  >
                    <span className="font-mono text-sm font-semibold">
                      {log?.weight ?? set.weight ?? t("bodyweight")}
                    </span>
                    <span className="font-mono text-[9px] tracking-wider">{log?.reps ?? set.reps}</span>
                  </button>
                );
              })}
            </div>
          </div>
          );
        })}

        <button
          type="button"
          onClick={onFinish}
          className={cn(
            "mt-1.5 h-12.5 w-full rounded-[11px] text-[15px] font-semibold",
            allDone ? "bg-primary text-primary-foreground" : "bg-[#1E293B] text-[#94A3B8]"
          )}
        >
          {allDone ? t("finishDone") : t("finish")}
        </button>
      </div>

      <ExerciseVideoSheet
        locale={locale}
        exercise={videoExercise}
        open={videoExercise != null}
        onOpenChange={(open) => !open && setVideoExercise(null)}
      />
    </div>
  );
}
