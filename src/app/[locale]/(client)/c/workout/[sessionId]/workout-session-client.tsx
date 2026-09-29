"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, ChevronLeft, Play } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { ApertureSweep } from "@/components/brand/aperture-sweep";
import { ExerciseVideoSheet } from "@/components/workout/exercise-video-sheet";
import { ExerciseSwapSheet, type SwapExercise } from "@/components/workout/exercise-swap-sheet";
import { SetEntrySheet, type LoggedSetValues } from "@/components/workout/set-entry-sheet";
import { ExerciseFeedbackSheet, type ExerciseFeedbackValues } from "@/components/workout/exercise-feedback-sheet";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { Database } from "@/lib/supabase/database.types";
import {
  logSetAction,
  updateSetAction,
  deleteSetAction,
  setExerciseResultAction,
  saveSessionProgressAction,
  completeSessionAction,
} from "@/domain/workouts/workouts-actions";
import { projectSetsForWeek, type ProgressionRule } from "@/domain/programs/progression";
import { useRestTimer } from "@/hooks/use-rest-timer";
import { suggestNextWeight } from "@/domain/workouts/suggest";
import { cn } from "@/lib/utils";

type ProgramItemSetRow = Database["public"]["Tables"]["program_item_sets"]["Row"];
// Omits coach_note_private — the page's query selects an explicit column
// list (CLIENT_SAFE_ITEM_COLUMNS) rather than `*` specifically so that
// coach-only annotation never reaches this client component's props. See
// programs.service.ts's doc comment on that constant.
type ProgramItem = Omit<Database["public"]["Tables"]["program_items"]["Row"], "coach_note_private"> & {
  exercises: Pick<
    Database["public"]["Tables"]["exercises"]["Row"],
    | "id"
    | "name_ar"
    | "name_en"
    | "muscle_group"
    | "video_url"
    | "image_url"
    | "thumbnail_url"
    | "cues_ar"
    | "cues_en"
    | "steps_ar"
    | "steps_en"
    | "mistakes_ar"
    | "mistakes_en"
    | "safety_ar"
    | "safety_en"
    | "tempo"
  >;
  program_item_sets: ProgramItemSetRow[]; // must already be ordered by set_index
};
type ProgramDay = Database["public"]["Tables"]["program_days"]["Row"] & { program_items: ProgramItem[] };
type WorkoutSetLog = Database["public"]["Tables"]["workout_set_logs"]["Row"];

/** min-max reps across a projected set list, formatted like the old
 * program_items.reps range string ("8-12" or "10") — display-only, purely
 * cosmetic continuity with the previous header line. Duration-only sets
 * (reps null — a rehab hold, a stretch) are excluded from the range; if
 * every set in the list is duration-only, falls back to a "Ns hold" label
 * off the first set instead of an empty range. */
function repsRangeLabel(sets: { reps: number | null; duration_seconds: number | null }[]): string {
  const reps = sets.map((s) => s.reps).filter((r): r is number => r != null);
  if (reps.length === 0) {
    const duration = sets[0]?.duration_seconds;
    return duration != null ? `${duration}s` : "";
  }
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
  initialExerciseResults,
  lastPerformance,
  alreadyCompleted,
  initialElapsedSeconds,
  adjustedItemReasons,
}: {
  locale: AppLocale;
  day: ProgramDay;
  /** Which week's progression to project — see program-cycle.ts's
   * weekIndexForDate, resolved server-side from the program's start_date. */
  week: number;
  sessionId: string;
  initialSetLogs: WorkoutSetLog[];
  initialExerciseResults: { program_item_id: string; status: string }[];
  /** Latest logged set per exercise_id, keyed as a plain object (server
   * actions can't return a Map) — see getLastPerformanceAction. Drives
   * suggestNextWeight and the set button's "prev" line, which reads real
   * history when it exists rather than always showing the static
   * week-minus-1 projection. */
  lastPerformance: Record<string, { weight: number | null; reps: number | null; rpe: number | null }>;
  alreadyCompleted: boolean;
  /** Elapsed time as of the last saveSessionProgressAction call — resuming
   * a backgrounded/refreshed session picks up here instead of restarting
   * the timer at 0. */
  initialElapsedSeconds: number;
  /** program_item_id -> reason_key for items an applied Coaching Ledger
   * decision touched recently (LedgerService.listActiveAdjustedItemIds) —
   * plain object, same server-action-can't-return-a-Map reasoning as
   * lastPerformance. Drives the "why" chip below the exercise name. */
  adjustedItemReasons: Record<string, string>;
}) {
  const t = useTranslations("client.workout");
  const tReason = useTranslations("review.reason.options");
  const router = useRouter();
  const BackIcon = locale === "ar" ? ChevronRight : ChevronLeft;

  const [logs, setLogs] = useState(() => {
    const map = new Map<string, WorkoutSetLog>();
    for (const log of initialSetLogs) map.set(setKey(log.program_item_id, log.set_index), log);
    return map;
  });
  const [elapsedS, setElapsedS] = useState(initialElapsedSeconds);
  const restTimer = useRestTimer();
  const [done, setDone] = useState(alreadyCompleted);
  const [videoExercise, setVideoExercise] = useState<SwapExercise | null>(null);
  const [swaps, setSwaps] = useState<Map<string, SwapExercise>>(new Map());
  const [swapItem, setSwapItem] = useState<ProgramItem | null>(null);
  const [activeSet, setActiveSet] = useState<{
    item: ProgramItem;
    setIndex: number;
    prescribed: { reps: number | null; weight: number | null; duration_seconds: number | null };
  } | null>(null);
  const [savingSet, setSavingSet] = useState(false);
  const [exerciseResults, setExerciseResults] = useState<Map<string, "done" | "skipped">>(() => {
    const map = new Map<string, "done" | "skipped">();
    for (const r of initialExerciseResults) map.set(r.program_item_id, r.status as "done" | "skipped");
    return map;
  });
  const [feedbackItem, setFeedbackItem] = useState<ProgramItem | null>(null);

  function activeExercise(item: ProgramItem): SwapExercise {
    return swaps.get(item.id) ?? item.exercises;
  }

  const projectedByItem = new Map(
    day.program_items.map((item) => [
      item.id,
      projectSetsForWeek(item.program_item_sets, item.progression_rule as ProgressionRule, week),
    ])
  );
  const showPrev = week > 1;
  const prevByItem = showPrev
    ? new Map(
        day.program_items.map((item) => [
          item.id,
          projectSetsForWeek(item.program_item_sets, item.progression_rule as ProgressionRule, week - 1),
        ])
      )
    : null;
  const totalSets = day.program_items.reduce((sum, item) => sum + item.program_item_sets.length, 0);
  const doneCount = logs.size;
  const allDone = totalSets > 0 && doneCount === totalSets;

  // Consecutive items sharing group_key become one visual block (bordered,
  // labeled A1/A2/...) — reorderItems already enforces server-side that a
  // group's members stay contiguous, so a simple consecutive-run grouping
  // here is sufficient; it never needs to handle a split group.
  const itemGroups: ProgramItem[][] = [];
  for (const item of day.program_items) {
    const last = itemGroups[itemGroups.length - 1];
    if (item.group_key && last?.[0]?.group_key === item.group_key) {
      last.push(item);
    } else {
      itemGroups.push([item]);
    }
  }

  // A block-kind header is inserted before the first item-group whose block
  // differs from the previous one — items are expected to already be
  // ordered warmup -> main -> cooldown (the builder doesn't enforce it, but
  // a block header simply won't repeat if a coach interleaves them). Using
  // "block" as a display heading only; it doesn't change set logging or
  // grouping behavior at all.
  let lastBlock: string | null = null;

  function shouldShowBlockHeader(group: ProgramItem[]): boolean {
    const block = group[0].block;
    if (block === lastBlock) return false;
    lastBlock = block;
    return true;
  }

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      setElapsedS((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [done]);

  // Persists elapsed time (and which item's set-entry sheet is open, if
  // any) every 15s while the session is active — a refresh or the app
  // being backgrounded then killed resumes from here instead of 0. A ref
  // for elapsedS avoids resetting this interval on every second tick.
  const elapsedRef = useRef(elapsedS);
  useEffect(() => {
    elapsedRef.current = elapsedS;
  }, [elapsedS]);
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      saveSessionProgressAction(sessionId, elapsedRef.current, activeSet?.item.id ?? null);
    }, 15_000);
    return () => clearInterval(id);
  }, [done, sessionId, activeSet]);

  function openSetEntry(item: ProgramItem, setIndex: number, prescribed: { reps: number | null; weight: number | null; duration_seconds: number | null }) {
    setActiveSet({ item, setIndex, prescribed });
  }

  /** Suggested weight for a set that hasn't been logged yet — real history
   * for this exercise if there is any, otherwise the coach's static
   * prescription. Looked up by the *active* (possibly swapped) exercise's
   * id, so a suggestion never bleeds across a mid-session substitution. */
  function suggestedWeight(item: ProgramItem, prescribed: { reps: number | null; weight: number | null; duration_seconds: number | null }): number | null {
    const exerciseId = activeExercise(item).id;
    const history = lastPerformance[exerciseId];
    // A duration-based set (reps null — a rehab hold, a stretch) has no rep
    // target to progress against, so there's nothing for suggestNextWeight
    // to compare — same "nothing to suggest" as no history at all.
    if (!history || prescribed.reps == null) return prescribed.weight;
    return suggestNextWeight({
      lastWeight: history.weight,
      lastReps: history.reps,
      lastRpe: history.rpe,
      targetReps: prescribed.reps,
    });
  }

  // Optimistic-update pattern used throughout this file: apply the change
  // to local state and close/advance the UI immediately (this is a client
  // logging their own workout — the write is single-row and scoped to
  // their own session, so it's safe to assume success), then reconcile
  // with the server response in the background. On an error, roll back to
  // the snapshot taken before the optimistic apply and surface a toast —
  // the user sees the entry disappear/revert rather than a frozen sheet.
  // `savingSet` still exists as a light guard against double-submitting the
  // same sheet, not as a blocking spinner.

  async function saveActiveSet(values: LoggedSetValues) {
    if (!activeSet) return;
    const { item, setIndex, prescribed } = activeSet;
    const key = setKey(item.id, setIndex);
    const existing = logs.get(key);
    if (savingSet) return;
    setSavingSet(true);

    const logsSnapshot = logs;
    const isNewSet = !existing;

    // Close the sheet and reflect the entry immediately — the optimistic
    // row is replaced with the server's real row a moment later, or rolled
    // back on failure.
    const optimisticLog: WorkoutSetLog = {
      ...(existing ?? {
        id: `optimistic-${key}`,
        session_id: sessionId,
        program_item_id: item.id,
        set_index: setIndex,
        client_id: "",
        coach_id: "",
        completed_at: new Date().toISOString(),
        prescribed_reps: prescribed.reps,
        prescribed_weight: prescribed.weight,
        duration_seconds: null,
        substituted_exercise_id: swaps.get(item.id)?.id ?? null,
      }),
      weight: values.weight,
      reps: values.reps ?? prescribed.reps,
      duration_seconds: values.duration_seconds ?? prescribed.duration_seconds,
      rpe: values.rpe,
      notes: values.notes ?? null,
    };
    setLogs((prev) => new Map(prev).set(key, optimisticLog));
    setActiveSet(null);
    if (isNewSet) restTimer.start(item.rest_seconds ?? 90);

    try {
      const result = existing ? await updateSetAction(existing.id, values) : await logSetAction(sessionId, {
        program_item_id: item.id,
        set_index: setIndex,
        weight: values.weight,
        reps: values.reps ?? prescribed.reps,
        duration_seconds: values.duration_seconds ?? prescribed.duration_seconds,
        rpe: values.rpe,
        notes: values.notes,
        substituted_exercise_id: swaps.get(item.id)?.id ?? null,
      });
      if ("error" in result) {
        setLogs(logsSnapshot);
        if (isNewSet) restTimer.skip();
        toast.error(result.error === "entry_locked" ? t("setEntry.entryLocked") : t("setEntry.saveFailed"));
        return;
      }
      setLogs((prev) => new Map(prev).set(key, result.log));
    } catch {
      setLogs(logsSnapshot);
      if (isNewSet) restTimer.skip();
      toast.error(t("setEntry.saveFailed"));
    } finally {
      setSavingSet(false);
    }
  }

  async function deleteActiveSet() {
    if (!activeSet) return;
    const { item, setIndex } = activeSet;
    const key = setKey(item.id, setIndex);
    const existing = logs.get(key);
    if (!existing) {
      setActiveSet(null);
      return;
    }
    if (savingSet) return;
    setSavingSet(true);

    const logsSnapshot = logs;
    setLogs((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    setActiveSet(null);

    try {
      const result = await deleteSetAction(existing.id);
      if ("error" in result) {
        setLogs(logsSnapshot);
        toast.error(result.error === "entry_locked" ? t("setEntry.entryLocked") : t("setEntry.deleteFailed"));
        return;
      }
    } catch {
      setLogs(logsSnapshot);
      toast.error(t("setEntry.deleteFailed"));
    } finally {
      setSavingSet(false);
    }
  }

  function markDone(item: ProgramItem) {
    setFeedbackItem(item);
  }

  async function skipExercise(item: ProgramItem) {
    const resultsSnapshot = exerciseResults;
    setExerciseResults((prev) => new Map(prev).set(item.id, "skipped"));
    try {
      const result = await setExerciseResultAction(sessionId, item.id, { status: "skipped" });
      if ("error" in result) {
        setExerciseResults(resultsSnapshot);
        toast.error(t("feedback.saveFailed"));
      }
    } catch {
      setExerciseResults(resultsSnapshot);
      toast.error(t("feedback.saveFailed"));
    }
  }

  async function saveExerciseFeedback(values: ExerciseFeedbackValues) {
    if (!feedbackItem) return;
    const item = feedbackItem;
    const resultsSnapshot = exerciseResults;
    setExerciseResults((prev) => new Map(prev).set(item.id, "done"));
    setFeedbackItem(null);
    try {
      const result = await setExerciseResultAction(sessionId, item.id, { status: "done", ...values });
      if ("error" in result) {
        setExerciseResults(resultsSnapshot);
        toast.error(t("feedback.saveFailed"));
      }
    } catch {
      setExerciseResults(resultsSnapshot);
      toast.error(t("feedback.saveFailed"));
    }
  }

  async function skipFeedback() {
    if (!feedbackItem) return;
    const item = feedbackItem;
    const resultsSnapshot = exerciseResults;
    setExerciseResults((prev) => new Map(prev).set(item.id, "done"));
    setFeedbackItem(null);
    try {
      const result = await setExerciseResultAction(sessionId, item.id, { status: "done" });
      if ("error" in result) {
        setExerciseResults(resultsSnapshot);
        toast.error(t("feedback.saveFailed"));
      }
    } catch {
      setExerciseResults(resultsSnapshot);
      toast.error(t("feedback.saveFailed"));
    }
  }

  const [finishing, setFinishing] = useState(false);
  // Splash only fires for a finish that happens *in this render* -- reopening
  // a day that was already completed (alreadyCompleted from the server) is
  // "راجع التمرين" / reviewWorkout, which should show the logged session
  // (checkmarks, logged reps, doneCount/totalSets header below), not the
  // one-time finish celebration.
  const [justFinished, setJustFinished] = useState(false);

  async function onFinish() {
    if (finishing) return;
    setFinishing(true);
    // Reflect completion immediately -- there's nowhere useful for the
    // client to keep interacting with this session while the write lands,
    // and the summary screen doesn't depend on the server response.
    setDone(true);
    setJustFinished(true);
    try {
      await completeSessionAction(sessionId, elapsedS);
    } catch {
      // The session write is idempotent server-side (completeSessionAction
      // just stamps completed_at); if it failed, the next visit to this
      // session will simply retry via alreadyCompleted's normal path, so
      // there's no local rollback needed here -- just let the user know.
      toast.error(t("finishSaveFailed"));
    }
  }

  if (justFinished) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-y-auto bg-card px-8 py-10 text-center text-card-foreground">
        <ApertureSweep size={104} className="text-card-foreground" />
        <div>
          <p className="text-xl font-semibold text-foreground">{t("finishDone")}</p>
          <p className="mt-2.5 max-w-xs text-[13.5px] leading-relaxed text-muted-foreground">
            {t("doneBody", { sets: doneCount, duration: mmss(elapsedS) })}
          </p>
        </div>
        <Link
          href="/c"
          className="flex h-12 items-center rounded-[11px] border border-border px-7 text-sm font-semibold text-foreground"
        >
          {t("close")}
        </Link>
      </div>
    );
  }

  return (
    // Fixed full-bleed overlay, same reasoning as the forms/[assignmentId]
    // fill screen: this is a bare full-viewport session runner, not a page
    // meant to sit inside the (client)/c layout's header/nav/max-w-lg chrome.
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background text-foreground">
      <div className="flex items-center gap-3 border-b border-border px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3.5">
        <button
          type="button"
          onClick={() => router.push("/c")}
          aria-label={t("close")}
          className="flex size-11 -ms-3 shrink-0 items-center justify-center text-muted-foreground"
        >
          <BackIcon className="size-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-foreground">
            {day.label_ar || day.label_en ? pickLocale(day, locale, "label") : t("todayWorkout")}
          </p>
          <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{t("setsDone", { done: doneCount, total: totalSets })}</p>
        </div>
        <p className="shrink-0 font-mono text-[17px] font-semibold text-primary">{mmss(elapsedS)}</p>
      </div>

      {restTimer.isResting && (
        <div className="flex flex-wrap items-center gap-2.5 bg-primary px-5 py-3.5">
          <p className="font-mono text-xl font-semibold text-primary-foreground">{mmss(restTimer.remaining)}</p>
          <div className="h-1 min-w-16 flex-1 overflow-hidden rounded-full bg-primary-foreground/25">
            <div
              className="h-full bg-primary-foreground"
              style={{ width: `${(restTimer.remaining / restTimer.duration) * 100}%` }}
            />
          </div>
          <button
            type="button"
            onClick={() => restTimer.adjust(-15)}
            aria-label={t("restMinus15")}
            className="flex h-11 min-w-11 shrink-0 items-center justify-center px-2 text-xs font-semibold text-primary-foreground"
          >
            −15
          </button>
          <button
            type="button"
            onClick={() => restTimer.adjust(15)}
            aria-label={t("restPlus15")}
            className="flex h-11 min-w-11 shrink-0 items-center justify-center px-2 text-xs font-semibold text-primary-foreground"
          >
            +15
          </button>
          <button
            type="button"
            onClick={restTimer.skip}
            className="flex h-11 shrink-0 items-center justify-center px-2 text-xs font-semibold text-primary-foreground"
          >
            {t("skipRest")}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3.5 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {itemGroups.map((group, groupIdx) => {
          const showBlockHeader = shouldShowBlockHeader(group);
          return (
          <div key={group[0].id} className="flex flex-col gap-2.5">
            {showBlockHeader && (
              <p className="mt-1 px-1 text-[13px] font-semibold text-foreground first:mt-0">
                {t(`blockKind.${group[0].block}`)}
              </p>
            )}
            <div
              className={cn(
                "flex flex-col gap-2.5",
                group.length > 1 && "rounded-2xl border border-primary/30 p-2.5"
              )}
            >
            {group.length > 1 && (
              <p className="px-1 font-mono text-[9.5px] tracking-wider text-primary uppercase">
                {group[0].group_kind === "circuit" ? t("circuitLabel") : t("supersetLabel")}
              </p>
            )}
            {group.map((item, positionInGroup) => {
          const displaySets = projectedByItem.get(item.id) ?? [];
          const prevSets = prevByItem?.get(item.id) ?? null;
          const groupLabel = group.length > 1 ? `${String.fromCharCode(65 + groupIdx)}${positionInGroup + 1}` : null;
          return (
          <div key={item.id} className="rounded-2xl bg-card p-4">
            <div className="mb-3.5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setVideoExercise(activeExercise(item))}
                className="relative flex size-none h-13.5 w-19.5 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-muted"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-card/95">
                  <Play className="size-3 fill-card-foreground text-card-foreground ms-0.5" aria-hidden="true" />
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold text-card-foreground">
                  {groupLabel && (
                    <span className="me-1.5 rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                      {groupLabel}
                    </span>
                  )}
                  {pickLocale(activeExercise(item), locale)}
                </p>
                {swaps.has(item.id) && (
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {t("insteadOf", { name: pickLocale(item.exercises, locale) })}
                  </p>
                )}
                {adjustedItemReasons[item.id] && (
                  <p className="mt-0.5 truncate text-[10px] text-primary">
                    {t("adjustedChip", { reason: tReason(adjustedItemReasons[item.id]) })}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {displaySets.length} × {repsRangeLabel(displaySets)}
                  </span>
                  {activeExercise(item).video_url && (
                    <button
                      type="button"
                      onClick={() => setVideoExercise(activeExercise(item))}
                      className="-my-1.5 min-h-8 shrink-0 px-0 py-1.5 text-[11.5px] font-medium text-primary"
                    >
                      {t("watchForm")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSwapItem(item)}
                    className="-my-1.5 min-h-8 shrink-0 px-0 py-1.5 text-[11.5px] font-medium text-muted-foreground"
                  >
                    {t("swap")}
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2">
              {displaySets.map((set, i) => {
                const log = logs.get(setKey(item.id, i + 1));
                const on = log != null;
                // Real logged history for this exercise beats the static
                // week-minus-1 projection — it's what the client actually
                // did, not what the coach's progression rule assumes.
                const history = lastPerformance[activeExercise(item).id];
                const prevSet = history
                  ? { weight: history.weight, reps: history.reps ?? set.reps }
                  : (prevSets?.[i] ?? null);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      openSetEntry(item, i + 1, {
                        reps: set.reps,
                        weight: set.weight ?? null,
                        duration_seconds: set.duration_seconds,
                      })
                    }
                    className={cn(
                      "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[10px] border-[1.5px] px-1",
                      showPrev ? "h-16" : "h-13",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                    )}
                  >
                    <span className="max-w-full truncate font-mono text-sm font-semibold">
                      {log?.weight ?? set.weight ?? t("bodyweight")}
                    </span>
                    <span className="font-mono text-[9px] tracking-wider">{log?.reps ?? set.reps}</span>
                    {prevSet && (
                      <span className="max-w-full truncate font-mono text-[8px] tracking-wide opacity-60">
                        {t("prevShort")} {prevSet.weight != null ? `${prevSet.weight}×${prevSet.reps}` : prevSet.reps}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              {exerciseResults.get(item.id) === "done" && (
                <span className="text-[11px] font-medium text-primary">{t("exerciseDone")}</span>
              )}
              {exerciseResults.get(item.id) === "skipped" && (
                <span className="text-[11px] font-medium text-muted-foreground">{t("exerciseSkipped")}</span>
              )}
              {!exerciseResults.has(item.id) && (
                <>
                  <button
                    type="button"
                    onClick={() => markDone(item)}
                    className="-my-1.5 min-h-8 px-0 py-1.5 text-[11.5px] font-medium text-primary"
                  >
                    {t("markDone")}
                  </button>
                  <button
                    type="button"
                    onClick={() => skipExercise(item)}
                    className="-my-1.5 min-h-8 px-0 py-1.5 text-[11.5px] font-medium text-muted-foreground"
                  >
                    {t("skipExercise")}
                  </button>
                </>
              )}
            </div>
          </div>
          );
            })}
            </div>
          </div>
          );
        })}

        <button
          type="button"
          onClick={onFinish}
          disabled={finishing}
          className={cn(
            "mt-1.5 h-12.5 w-full rounded-[11px] text-[15px] font-semibold disabled:opacity-60",
            allDone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
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

      <ExerciseSwapSheet
        locale={locale}
        open={swapItem != null}
        onOpenChange={(open) => !open && setSwapItem(null)}
        originalExerciseId={swapItem?.exercises.id ?? ""}
        activeExerciseId={swapItem ? (swaps.get(swapItem.id)?.id ?? swapItem.exercises.id) : ""}
        muscleGroup={swapItem?.exercises.muscle_group ?? null}
        onSelect={(exercise) => {
          if (!swapItem) return;
          setSwaps((prev) => new Map(prev).set(swapItem.id, exercise));
          setSwapItem(null);
        }}
        onUseOriginal={() => {
          if (!swapItem) return;
          setSwaps((prev) => {
            const next = new Map(prev);
            next.delete(swapItem.id);
            return next;
          });
          setSwapItem(null);
        }}
      />

      {activeSet && (() => {
        const key = setKey(activeSet.item.id, activeSet.setIndex);
        const existing = logs.get(key);
        const initial: LoggedSetValues = existing
          ? {
              weight: existing.weight,
              reps: existing.reps,
              duration_seconds: existing.duration_seconds,
              rpe: existing.rpe,
              notes: existing.notes,
            }
          : {
              weight: suggestedWeight(activeSet.item, activeSet.prescribed),
              reps: activeSet.prescribed.reps,
              duration_seconds: activeSet.prescribed.duration_seconds,
              rpe: null,
              notes: null,
            };
        return (
          <SetEntrySheet
            open={activeSet != null}
            onOpenChange={(open) => !open && setActiveSet(null)}
            formKey={key}
            initial={initial}
            mode={activeSet.prescribed.duration_seconds != null ? "duration" : "reps"}
            onSave={saveActiveSet}
            onDelete={existing ? deleteActiveSet : undefined}
            saving={savingSet}
          />
        );
      })()}

      <ExerciseFeedbackSheet
        open={feedbackItem != null}
        onOpenChange={(open) => !open && setFeedbackItem(null)}
        onSave={saveExerciseFeedback}
        onSkip={skipFeedback}
      />
    </div>
  );
}
