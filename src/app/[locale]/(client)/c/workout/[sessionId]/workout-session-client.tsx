"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, Play, Timer } from "lucide-react";
import { toast } from "sonner";
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
import { projectSetsForWeek, type BaseSet, type ProgressionRule } from "@/domain/programs/progression";
import { useRestTimer } from "@/hooks/use-rest-timer";
import { suggestNextWeight } from "@/domain/workouts/suggest";
import { computeSessionSummary } from "@/domain/workouts/summary";
import {
  buildSteps,
  exerciseSummaries,
  mmss,
  nextOpenStep,
  parseDecimal,
  prefillDraft,
  previousSetLog,
  shouldRest,
  stepValue,
  trimNumber,
  type Step,
} from "@/domain/workouts/session-runner";
import { isKnownMuscleGroup } from "@/domain/library/taxonomy";
import { cn } from "@/lib/utils";
import { SessionDock } from "./session-dock";
import { SessionSummary } from "./session-summary";

type ProgramItemSetRow = Database["public"]["Tables"]["program_item_sets"]["Row"];
// Omits coach_note_private — the page's query selects an explicit column
// list (CLIENT_SAFE_ITEM_COLUMNS) rather than `*` specifically so that
// coach-only annotation never reaches this client component's props. See
// programs.service.ts's doc comment on that constant.
type ProgramItem = Omit<Database["public"]["Tables"]["program_items"]["Row"], "coach_note_private"> & {
  exercises: SwapExercise;
  program_item_sets: ProgramItemSetRow[]; // must already be ordered by set_index
};
type ProgramDay = Database["public"]["Tables"]["program_days"]["Row"] & { program_items: ProgramItem[] };
type WorkoutSetLog = Database["public"]["Tables"]["workout_set_logs"]["Row"];
type Prescribed = { reps: number | null; weight: number | null; duration_seconds: number | null };
type Draft = { weight: string; count: string };

/** min-max reps across a projected set list ("8-12" or "10"). Duration-only
 * sets (reps null — a rehab hold, a stretch) are excluded from the range; if
 * every set is duration-only, falls back to the first set's seconds. */
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

// Logs are keyed by `${program_item_id}-${set_index}` (1-based set_index,
// same as program_item_sets and the DB's unique key).
function setKey(programItemId: string, setIndex: number): string {
  return `${programItemId}-${setIndex}`;
}

/** A1/A2 labels for consecutive items sharing group_key — letter by the
 * item-group's position in the day. */
function groupLabelsFor(items: { id: string; group_key: string | null }[]): Map<string, string> {
  const labels = new Map<string, string>();
  let groupIdx = -1;
  let prevKey: string | null = null;
  let pos = 0;
  for (const item of items) {
    if (item.group_key && item.group_key === prevKey) pos++;
    else {
      groupIdx++;
      pos = 0;
    }
    prevKey = item.group_key;
    if (item.group_key) labels.set(item.id, `${String.fromCharCode(65 + groupIdx)}${pos + 1}`);
  }
  return labels;
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
  initialItemId,
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
  /** Latest logged set per exercise_id from a previous session, as a plain
   * object (server actions can't return a Map) — see
   * getLastPerformanceAction. Drives suggestNextWeight and "last time". */
  lastPerformance: Record<string, { weight: number | null; reps: number | null; rpe: number | null }>;
  alreadyCompleted: boolean;
  /** Elapsed time as of the last saveSessionProgressAction call — resuming
   * a backgrounded/refreshed session picks up here instead of restarting
   * the timer at 0. */
  initialElapsedSeconds: number;
  /** workout_sessions.current_item_id — the exercise the client was on. */
  initialItemId: string | null;
  /** program_item_id -> reason_key for items an applied Coaching Ledger
   * decision touched recently (LedgerService.listActiveAdjustedItemIds). */
  adjustedItemReasons: Record<string, string>;
}) {
  const t = useTranslations("client.workout");
  const tReason = useTranslations("review.reason.options");
  const tGroups = useTranslations("library.muscleGroups");
  const router = useRouter();
  const BackIcon = locale === "ar" ? ChevronRight : ChevronLeft;
  const ForwardIcon = locale === "ar" ? ChevronLeft : ChevronRight;

  const items = day.program_items;
  const projectedByItem = new Map(
    items.map((item) => [
      item.id,
      projectSetsForWeek(item.program_item_sets, item.progression_rule as ProgressionRule, week) as BaseSet[],
    ])
  );
  const orderItems = items.map((item) => ({
    id: item.id,
    order_index: item.order_index,
    group_key: item.group_key,
    setCount: item.program_item_sets.length,
  }));
  const steps = buildSteps(orderItems);

  const groupLabels = groupLabelsFor(items);

  const [logs, setLogs] = useState(() => {
    const map = new Map<string, WorkoutSetLog>();
    for (const log of initialSetLogs) map.set(setKey(log.program_item_id, log.set_index), log);
    return map;
  });
  const [exerciseResults, setExerciseResults] = useState<Map<string, "done" | "skipped">>(() => {
    const map = new Map<string, "done" | "skipped">();
    for (const r of initialExerciseResults) map.set(r.program_item_id, r.status as "done" | "skipped");
    return map;
  });
  const [swaps, setSwaps] = useState<Map<string, SwapExercise>>(new Map());
  const [elapsedS, setElapsedS] = useState(initialElapsedSeconds);
  const restTimer = useRestTimer();
  const [completed, setCompleted] = useState(alreadyCompleted);
  const [view, setView] = useState<"run" | "summary">(alreadyCompleted ? "summary" : "run");
  const [finishing, setFinishing] = useState(false);
  /** What the rest panel's "up next" line announces. */
  const [upNext, setUpNext] = useState<{ itemId: string; setIndex: number; sameExercise: boolean } | null>(null);
  const [videoExercise, setVideoExercise] = useState<SwapExercise | null>(null);
  const [swapItem, setSwapItem] = useState<ProgramItem | null>(null);
  const [editSet, setEditSet] = useState<{ item: ProgramItem; setIndex: number; prescribed: Prescribed } | null>(null);
  const [savingSet, setSavingSet] = useState(false);
  const [feedbackItem, setFeedbackItem] = useState<ProgramItem | null>(null);

  /** Logged, or its exercise was skipped — either way nothing left to do. */
  function closedIn(logMap: Map<string, WorkoutSetLog>, results: Map<string, "done" | "skipped">) {
    return (itemId: string, setIndex: number) => logMap.has(setKey(itemId, setIndex)) || results.get(itemId) === "skipped";
  }
  const isClosed = closedIn(logs, exerciseResults);

  function activeExercise(item: ProgramItem, swapMap = swaps): SwapExercise {
    return swapMap.get(item.id) ?? item.exercises;
  }

  function firstOpenSet(item: ProgramItem, closed = isClosed): number | null {
    for (let s = 1; s <= item.program_item_sets.length; s++) if (!closed(item.id, s)) return s;
    return null;
  }

  function prescribedFor(item: ProgramItem, setIndex: number): Prescribed {
    const set = projectedByItem.get(item.id)?.[setIndex - 1];
    return { reps: set?.reps ?? null, weight: set?.weight ?? null, duration_seconds: set?.duration_seconds ?? null };
  }

  /** Real history for this exercise if there is any, otherwise the coach's
   * prescription — looked up by the *active* (possibly swapped) exercise so
   * a suggestion never bleeds across a mid-session substitution. */
  function suggestedWeight(item: ProgramItem, prescribed: Prescribed, swapMap = swaps): number | null {
    const history = lastPerformance[activeExercise(item, swapMap).id];
    if (!history || prescribed.reps == null) return prescribed.weight;
    return suggestNextWeight({
      lastWeight: history.weight,
      lastReps: history.reps,
      lastRpe: history.rpe,
      targetReps: prescribed.reps,
    });
  }

  /** Dock values for the item's next open set: the previous set logged in
   * this workout, else the target. */
  function seedDraft(item: ProgramItem, logMap = logs, swapMap = swaps): Draft {
    const setIndex = firstOpenSet(item, closedIn(logMap, exerciseResults)) ?? item.program_item_sets.length;
    const prescribed = prescribedFor(item, setIndex);
    const itemLogs = [...logMap.values()].filter((l) => l.program_item_id === item.id);
    const values = prefillDraft(previousSetLog(itemLogs, setIndex), {
      ...prescribed,
      weight: suggestedWeight(item, prescribed, swapMap),
    });
    const count = prescribed.duration_seconds != null ? values.duration_seconds : values.reps;
    return { weight: values.weight != null ? trimNumber(values.weight) : "", count: count != null ? String(count) : "" };
  }

  const [currentItemId, setCurrentItemId] = useState<string | null>(() => {
    if (initialItemId && items.some((i) => i.id === initialItemId)) return initialItemId;
    return nextOpenStep(steps, isClosed)?.itemId ?? items[0]?.id ?? null;
  });
  const currentIdx = Math.max(0, items.findIndex((i) => i.id === currentItemId));
  const current = items[currentIdx] as ProgramItem | undefined;
  const [draft, setDraft] = useState<Draft>(() => (current ? seedDraft(current) : { weight: "", count: "" }));

  function goTo(item: ProgramItem) {
    setCurrentItemId(item.id);
    setDraft(seedDraft(item));
  }

  useEffect(() => {
    if (completed) return;
    const id = setInterval(() => setElapsedS((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [completed]);

  // Persists elapsed time and the current exercise every 15s while the
  // session is active — a refresh or a killed tab resumes from here. A ref
  // for elapsedS avoids resetting this interval on every second tick.
  const elapsedRef = useRef(elapsedS);
  useEffect(() => {
    elapsedRef.current = elapsedS;
  }, [elapsedS]);
  useEffect(() => {
    if (completed) return;
    const id = setInterval(() => {
      saveSessionProgressAction(sessionId, elapsedRef.current, currentItemId);
    }, 15_000);
    return () => clearInterval(id);
  }, [completed, sessionId, currentItemId]);

  // Optimistic-update pattern used throughout this file: apply the change
  // to local state immediately (a client logging their own workout — the
  // write is single-row and scoped to their own session), reconcile with
  // the server response in the background, and on error restore just the
  // touched row and surface a toast.
  function restoreRow(key: string, previous: WorkoutSetLog | undefined) {
    setLogs((prev) => {
      const next = new Map(prev);
      if (previous) next.set(key, previous);
      else next.delete(key);
      return next;
    });
  }

  function completeSet() {
    if (!current) return;
    const setIndex = firstOpenSet(current);
    if (setIndex == null) return;
    const item = current;
    const prescribed = prescribedFor(item, setIndex);
    const durationMode = prescribed.duration_seconds != null;
    const weightIn = parseDecimal(draft.weight);
    const countIn = parseDecimal(draft.count);
    // Bodyweight exercise with 0 extra load is stored as bodyweight (null).
    const weight = weightIn === 0 && prescribed.weight == null ? null : weightIn;
    const reps = durationMode ? null : countIn != null ? Math.round(countIn) : prescribed.reps;
    const duration_seconds = durationMode ? (countIn != null ? Math.round(countIn) : prescribed.duration_seconds) : null;
    const substituted_exercise_id = swaps.get(item.id)?.id ?? null;

    const key = setKey(item.id, setIndex);
    const optimistic: WorkoutSetLog = {
      id: `optimistic-${key}`,
      session_id: sessionId,
      program_item_id: item.id,
      set_index: setIndex,
      client_id: "",
      coach_id: "",
      relationship_id: null,
      completed_at: new Date().toISOString(),
      prescribed_reps: prescribed.reps,
      prescribed_weight: prescribed.weight,
      weight,
      reps,
      duration_seconds,
      rpe: null,
      notes: null,
      substituted_exercise_id,
    };
    const nextLogs = new Map(logs).set(key, optimistic);
    const closedNext = closedIn(nextLogs, exerciseResults);
    const step: Step = { itemId: item.id, setIndex, groupKey: item.group_key };
    const next = nextOpenStep(steps, closedNext, step);
    const draftBefore = draft;

    setLogs(nextLogs);
    // No rest after the workout's final set — the dock switches to Finish.
    const rested = next != null && shouldRest(step, orderItems, closedNext);
    if (rested) {
      const restSeconds = projectedByItem.get(item.id)?.[setIndex - 1]?.rest_seconds ?? item.rest_seconds ?? 90;
      restTimer.start(restSeconds);
      setUpNext({ itemId: next.itemId, setIndex: next.setIndex, sameExercise: next.itemId === item.id });
    }
    if (firstOpenSet(item, closedNext) == null && !exerciseResults.has(item.id)) setFeedbackItem(item);
    if (next) {
      const nextItem = items.find((i) => i.id === next.itemId)!;
      setCurrentItemId(nextItem.id);
      setDraft(nextItem.id === item.id ? { weight: draftBefore.weight, count: draftBefore.count } : seedDraft(nextItem, nextLogs));
    }

    const rollback = () => {
      restoreRow(key, undefined);
      if (rested) restTimer.skip();
      setCurrentItemId(item.id);
      setDraft(draftBefore);
    };
    logSetAction(sessionId, {
      program_item_id: item.id,
      set_index: setIndex,
      weight,
      reps,
      duration_seconds,
      rpe: null,
      notes: null,
      substituted_exercise_id,
    })
      .then((result) => {
        if ("error" in result) {
          rollback();
          toast.error(t("setEntry.saveFailed"));
          return;
        }
        setLogs((prev) => new Map(prev).set(key, result.log));
      })
      .catch(() => {
        rollback();
        toast.error(t("setEntry.saveFailed"));
      });
  }

  function continueToNext() {
    if (!current) return;
    const last: Step = { itemId: current.id, setIndex: current.program_item_sets.length, groupKey: current.group_key };
    const next = nextOpenStep(steps, isClosed, last);
    const nextItem = next && items.find((i) => i.id === next.itemId);
    if (nextItem) goTo(nextItem);
  }

  async function saveEditedSet(values: LoggedSetValues) {
    if (!editSet || savingSet) return;
    const key = setKey(editSet.item.id, editSet.setIndex);
    const existing = logs.get(key);
    if (!existing) return;
    setSavingSet(true);
    setLogs((prev) => new Map(prev).set(key, { ...existing, ...values }));
    setEditSet(null);
    try {
      const result = await updateSetAction(existing.id, values);
      if ("error" in result) {
        restoreRow(key, existing);
        toast.error(result.error === "entry_locked" ? t("setEntry.entryLocked") : t("setEntry.saveFailed"));
        return;
      }
      setLogs((prev) => new Map(prev).set(key, result.log));
    } catch {
      restoreRow(key, existing);
      toast.error(t("setEntry.saveFailed"));
    } finally {
      setSavingSet(false);
    }
  }

  async function deleteEditedSet() {
    if (!editSet || savingSet) return;
    const { item } = editSet;
    const key = setKey(item.id, editSet.setIndex);
    const existing = logs.get(key);
    setEditSet(null);
    if (!existing) return;
    setSavingSet(true);
    const nextLogs = new Map(logs);
    nextLogs.delete(key);
    setLogs(nextLogs);
    // The deleted set is now this exercise's open set — re-seed the dock.
    if (item.id === currentItemId) setDraft(seedDraft(item, nextLogs));
    try {
      const result = await deleteSetAction(existing.id);
      if ("error" in result) {
        restoreRow(key, existing);
        toast.error(result.error === "entry_locked" ? t("setEntry.entryLocked") : t("setEntry.deleteFailed"));
      }
    } catch {
      restoreRow(key, existing);
      toast.error(t("setEntry.deleteFailed"));
    } finally {
      setSavingSet(false);
    }
  }

  async function saveResult(item: ProgramItem, input: { status: "done" | "skipped" } & Partial<ExerciseFeedbackValues>) {
    const snapshot = exerciseResults;
    const nextResults = new Map(exerciseResults).set(item.id, input.status);
    setExerciseResults(nextResults);
    if (input.status === "skipped" && item.id === currentItemId) {
      const last: Step = { itemId: item.id, setIndex: item.program_item_sets.length, groupKey: item.group_key };
      const next = nextOpenStep(steps, closedIn(logs, nextResults), last);
      const nextItem = next && items.find((i) => i.id === next.itemId);
      if (nextItem) goTo(nextItem);
    }
    try {
      const result = await setExerciseResultAction(sessionId, item.id, input);
      if ("error" in result) {
        setExerciseResults(snapshot);
        toast.error(t("feedback.saveFailed"));
      }
    } catch {
      setExerciseResults(snapshot);
      toast.error(t("feedback.saveFailed"));
    }
  }

  function closeFeedback(values?: ExerciseFeedbackValues) {
    if (!feedbackItem) return;
    const item = feedbackItem;
    setFeedbackItem(null);
    void saveResult(item, { status: "done", ...values });
  }

  async function onFinish() {
    if (finishing) return;
    setFinishing(true);
    // Reflect completion immediately — the summary doesn't depend on the
    // server response, and completeSession is safe to retry.
    restTimer.skip();
    setCompleted(true);
    setView("summary");
    try {
      await completeSessionAction(sessionId, elapsedS);
    } catch {
      toast.error(t("finishSaveFailed"));
    } finally {
      setFinishing(false);
    }
  }

  const dayLabel = day.label_ar || day.label_en ? pickLocale(day, locale, "label") : t("todayWorkout");
  const totalSets = orderItems.reduce((sum, i) => sum + i.setCount, 0);
  const allLogs = [...logs.values()];

  if (view === "summary" || !current) {
    const perItem = exerciseSummaries(orderItems, allLogs);
    return (
      <SessionSummary
        locale={locale}
        dayLabel={dayLabel}
        elapsedSeconds={elapsedS}
        setsDone={logs.size}
        setsTotal={totalSets}
        totalVolume={computeSessionSummary(allLogs).totalVolume}
        rows={items.map((item, i) => ({ ...perItem[i], id: item.id, name: pickLocale(activeExercise(item), locale) }))}
        onEditSets={() => setView("run")}
      />
    );
  }

  const exercise = activeExercise(current);
  const displaySets = projectedByItem.get(current.id) ?? [];
  const openSet = firstOpenSet(current);
  const currentPrescribed = prescribedFor(current, openSet ?? 1);
  const durationMode = currentPrescribed.duration_seconds != null;
  const skipped = exerciseResults.get(current.id) === "skipped";
  const history = lastPerformance[exercise.id];
  const nextItem = items[currentIdx + 1];
  const prevItem = items[currentIdx - 1];
  const groupLabel = groupLabels.get(current.id);

  const kg = (w: number) => t("kg", { value: trimNumber(w) });
  const weightText = (w: number | null) => (w != null && w > 0 ? kg(w) : t("bodyweight"));
  const setText = (s: { weight: number | null; reps: number | null; duration_seconds: number | null }) =>
    `${weightText(s.weight)} × ${s.duration_seconds != null ? t("secondsShort", { value: s.duration_seconds }) : (s.reps ?? "")}`;

  const upNextItem = upNext && items.find((i) => i.id === upNext.itemId);
  const upNextLabel = !upNext || !upNextItem
    ? null
    : upNext.sameExercise
      ? t("upNextSet", { n: upNext.setIndex, total: upNextItem.program_item_sets.length })
      : t("upNextExercise", { name: pickLocale(activeExercise(upNextItem), locale) });

  const dockState =
    openSet != null && !skipped ? "log" : nextOpenStep(steps, isClosed) ? "exerciseComplete" : "allDone";
  const restSeconds = displaySets[(openSet ?? 1) - 1]?.rest_seconds ?? current.rest_seconds ?? 90;

  return (
    // Fixed full-bleed overlay: a bare full-viewport session runner, not a
    // page inside the (client)/c layout's header/nav chrome.
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <header className="flex shrink-0 flex-col gap-2 border-b border-border bg-card px-3 pt-[max(0.375rem,env(safe-area-inset-top))] pb-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => router.push("/c")}
            aria-label={t("close")}
            className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-foreground"
          >
            <BackIcon className="size-5.5" aria-hidden="true" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-[17px] leading-6 font-semibold">{dayLabel}</p>
            <p className="truncate text-sm text-muted-foreground">
              {t("exerciseOf", { current: currentIdx + 1, total: items.length })} ·{" "}
              <span className="font-mono tabular-nums">{t("setsDone", { done: logs.size, total: totalSets })}</span>
            </p>
          </div>
          <p aria-label={t("elapsed")} className="shrink-0 pe-1 font-mono text-base font-semibold text-primary tabular-nums">
            {mmss(elapsedS)}
          </p>
        </div>
        <div aria-hidden="true" className="flex gap-1">
          {items.map((item) => {
            const total = item.program_item_sets.length;
            const done = [...Array(total).keys()].filter((s) => logs.has(setKey(item.id, s + 1))).length;
            const isCurrent = item.id === current.id;
            return (
              <div
                key={item.id}
                style={{ flexGrow: Math.max(total, 1) }}
                className={cn("h-1.5 basis-0 overflow-hidden rounded-full", isCurrent ? "bg-primary/25" : "bg-border")}
              >
                <div
                  className={cn("h-full", isCurrent ? "bg-primary" : "bg-foreground")}
                  style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                />
              </div>
            );
          })}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setVideoExercise(exercise)}
              aria-label={`${t("watchForm")}: ${pickLocale(exercise, locale)}`}
              className="flex h-18 w-22 shrink-0 items-center justify-center rounded-xl bg-muted"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-card">
                <Play className="ms-0.5 size-4 fill-card-foreground text-card-foreground" aria-hidden="true" />
              </span>
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <div className="flex max-w-full flex-wrap items-center gap-1.5">
                {groupLabel && (
                  <span className="rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-xs font-bold text-primary">
                    {groupLabel} · {current.group_kind === "circuit" ? t("circuitLabel") : t("supersetLabel")}
                  </span>
                )}
                {isKnownMuscleGroup(exercise.muscle_group) && (
                  <span className="rounded-md bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent-tint-foreground">
                    {tGroups(exercise.muscle_group)}
                  </span>
                )}
              </div>
              <h1 className="max-w-full text-xl leading-7 font-semibold break-words">{pickLocale(exercise, locale)}</h1>
              {swaps.has(current.id) && (
                <p className="max-w-full truncate text-xs text-muted-foreground">
                  {t("insteadOf", { name: pickLocale(current.exercises, locale) })}
                </p>
              )}
              {adjustedItemReasons[current.id] && (
                <p className="max-w-full truncate text-xs text-primary">
                  {t("adjustedChip", { reason: tReason(adjustedItemReasons[current.id]) })}
                </p>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-2 rounded-2xl border border-border bg-card">
            <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
              <dt className="text-sm text-muted-foreground">{t("target")}</dt>
              <dd className="font-mono text-[15px] font-semibold break-words tabular-nums">
                {displaySets.length} × {repsRangeLabel(displaySets)} · {weightText(currentPrescribed.weight)}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 border-s border-border px-3 py-2.5">
              <dt className="text-sm text-muted-foreground">{t("lastTime")}</dt>
              <dd className="font-mono text-[15px] font-semibold break-words tabular-nums">
                {history ? `${weightText(history.weight)} × ${history.reps ?? ""}` : t("noHistory")}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Timer className="size-4" aria-hidden="true" />
              {t("rest")} <span className="font-mono tabular-nums">{mmss(restSeconds)}</span>
            </span>
            <span className="flex-1" />
            {exercise.video_url && (
              <button
                type="button"
                onClick={() => setVideoExercise(exercise)}
                className="h-11 rounded-[10px] px-3 text-sm font-medium text-primary"
              >
                {t("watchForm")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSwapItem(current)}
              className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3.5 text-sm font-medium"
            >
              <ArrowLeftRight className="size-4" aria-hidden="true" />
              {t("swap")}
            </button>
          </div>
        </section>

        <section aria-label={t("sets")} className="flex flex-col gap-2">
          {displaySets.map((set, i) => {
            const setIndex = i + 1;
            const log = logs.get(setKey(current.id, setIndex));
            if (log) {
              return (
                <button
                  key={setIndex}
                  type="button"
                  onClick={() => setEditSet({ item: current, setIndex, prescribed: prescribedFor(current, setIndex) })}
                  aria-label={t("editSet", { n: setIndex })}
                  className="flex min-h-13 w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 text-start"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                    <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                  </span>
                  <span className="shrink-0 text-[15px] text-muted-foreground">
                    {t("setN", { n: setIndex })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-end font-mono text-base font-semibold tabular-nums">
                    {setText(log)}
                  </span>
                </button>
              );
            }
            const isCurrent = setIndex === openSet && !skipped;
            return (
              <div
                key={setIndex}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5",
                  isCurrent ? "min-h-14 border-2 border-primary bg-card" : "min-h-12 border border-border text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border-2 font-mono text-sm font-semibold",
                    isCurrent ? "border-primary text-primary" : "border-border"
                  )}
                >
                  {isCurrent ? setIndex : null}
                </span>
                <span className={cn("shrink-0 text-[15px]", isCurrent && "font-semibold")}>{t("setN", { n: setIndex })}</span>
                {isCurrent && (
                  <span className="shrink-0 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                    {t("currentSet")}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-end font-mono text-sm text-muted-foreground tabular-nums">
                  {setText(set)}
                </span>
              </div>
            );
          })}
        </section>

        <nav aria-label={t("exerciseNav")} className="flex items-stretch gap-2">
          {prevItem && (
            <button
              type="button"
              onClick={() => goTo(prevItem)}
              aria-label={t("prevExercise")}
              className="flex w-13 shrink-0 items-center justify-center rounded-2xl border border-border bg-card"
            >
              <BackIcon className="size-5" aria-hidden="true" />
            </button>
          )}
          {nextItem ? (
            <button
              type="button"
              onClick={() => goTo(nextItem)}
              className="flex min-h-16 min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-2.5 text-start"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm text-muted-foreground">{t("next")}</span>
                <span className="truncate text-[15px] font-semibold">{pickLocale(activeExercise(nextItem), locale)}</span>
              </span>
              <span className="shrink-0 font-mono text-sm text-muted-foreground tabular-nums">
                {nextItem.program_item_sets.length} × {repsRangeLabel(projectedByItem.get(nextItem.id) ?? [])}
              </span>
              <ForwardIcon className="size-5 shrink-0" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onFinish}
              disabled={finishing}
              className="min-h-14 flex-1 rounded-2xl bg-muted text-[15px] font-semibold disabled:opacity-60"
            >
              {t("finish")}
            </button>
          )}
        </nav>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {skipped ? (
            <span className="text-sm font-medium text-muted-foreground">{t("exerciseSkipped")}</span>
          ) : (
            !exerciseResults.has(current.id) &&
            openSet != null && (
              <button
                type="button"
                onClick={() => saveResult(current, { status: "skipped" })}
                className="h-11 px-4 text-sm text-muted-foreground"
              >
                {t("skipExercise")}
              </button>
            )
          )}
          <button
            type="button"
            onClick={onFinish}
            disabled={finishing}
            className="h-11 px-4 text-sm text-muted-foreground disabled:opacity-60"
          >
            {t("finishNow")}
          </button>
        </div>
      </main>

      <SessionDock
        rest={restTimer}
        upNext={upNextLabel}
        state={dockState}
        weightLabel={currentPrescribed.weight == null ? t("extraWeightKg") : t("weightKg")}
        weight={draft.weight}
        onWeightChange={(weight) => setDraft((d) => ({ ...d, weight }))}
        onWeightStep={(delta) => setDraft((d) => ({ ...d, weight: stepValue(d.weight, delta, 0.25) }))}
        countMode={durationMode ? "duration" : "reps"}
        count={draft.count}
        onCountChange={(count) => setDraft((d) => ({ ...d, count }))}
        onCountStep={(delta) => setDraft((d) => ({ ...d, count: stepValue(d.count, delta) }))}
        completeLabel={t("completeSet", { n: openSet ?? 1, total: current.program_item_sets.length })}
        onComplete={completeSet}
        onContinue={continueToNext}
        onFinish={onFinish}
        finishing={finishing}
      />

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
        activeExerciseId={swapItem ? activeExercise(swapItem).id : ""}
        muscleGroup={swapItem?.exercises.muscle_group ?? null}
        onSelect={(exercise) => {
          if (!swapItem) return;
          const nextSwaps = new Map(swaps).set(swapItem.id, exercise);
          setSwaps(nextSwaps);
          if (swapItem.id === currentItemId) setDraft(seedDraft(swapItem, logs, nextSwaps));
          setSwapItem(null);
        }}
        onUseOriginal={() => {
          if (!swapItem) return;
          const nextSwaps = new Map(swaps);
          nextSwaps.delete(swapItem.id);
          setSwaps(nextSwaps);
          if (swapItem.id === currentItemId) setDraft(seedDraft(swapItem, logs, nextSwaps));
          setSwapItem(null);
        }}
      />

      {editSet &&
        (() => {
          const key = setKey(editSet.item.id, editSet.setIndex);
          const existing = logs.get(key);
          if (!existing) return null;
          return (
            <SetEntrySheet
              open
              onOpenChange={(open) => !open && setEditSet(null)}
              formKey={key}
              initial={{
                weight: existing.weight,
                reps: existing.reps,
                duration_seconds: existing.duration_seconds,
                rpe: existing.rpe,
                notes: existing.notes,
              }}
              mode={editSet.prescribed.duration_seconds != null ? "duration" : "reps"}
              onSave={saveEditedSet}
              onDelete={deleteEditedSet}
              saving={savingSet}
            />
          );
        })()}

      <ExerciseFeedbackSheet
        open={feedbackItem != null}
        onOpenChange={(open) => !open && setFeedbackItem(null)}
        onSave={closeFeedback}
        onSkip={() => closeFeedback()}
      />
    </div>
  );
}
