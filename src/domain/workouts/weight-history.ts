/** Pure helpers behind the coach's Weight History tab: URL param parsing,
 * grouping a session's sets per exercise, chart points and the A/B session
 * comparison. Weights are kg, same as everywhere else in the app. */

import type { ExerciseSeriesPoint, HistorySession } from "./workouts.service";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const PAGE_SIZE = 10;
export const MAX_PAGE = 200;

export type HistoryParams = { exerciseId?: string; from?: string; to?: string; limit: number };

/** Search params are user input: anything malformed is dropped, never
 * passed on to a query. */
export function parseHistoryParams(raw: { ex?: string; from?: string; to?: string; n?: string }): HistoryParams {
  const isDate = (s?: string) => !!s && DATE_RE.test(s) && !Number.isNaN(Date.parse(s));
  const n = Number.parseInt(raw.n ?? "", 10);
  return {
    exerciseId: raw.ex && UUID_RE.test(raw.ex) ? raw.ex : undefined,
    from: isDate(raw.from) ? raw.from : undefined,
    to: isDate(raw.to) ? raw.to : undefined,
    limit: Number.isFinite(n) ? Math.min(Math.max(n, PAGE_SIZE), MAX_PAGE) : PAGE_SIZE,
  };
}

/** Query string for the history tab ("?tab=history&ex=…"). `limit` is only
 * written when it's past the first page. */
export function historyQuery(p: Partial<HistoryParams>): string {
  const q = new URLSearchParams({ tab: "history" });
  if (p.exerciseId) q.set("ex", p.exerciseId);
  if (p.from) q.set("from", p.from);
  if (p.to) q.set("to", p.to);
  if (p.limit && p.limit > PAGE_SIZE) q.set("n", String(p.limit));
  return `?${q}`;
}

/** `to` is an inclusive calendar day, so the query bound is the start of the next day (UTC). */
export function dateBounds(from?: string, to?: string): { fromIso?: string; toIso?: string } {
  return {
    fromIso: from ? `${from}T00:00:00.000Z` : undefined,
    toIso: to ? new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000).toISOString() : undefined,
  };
}

export type SetGroup = { sets: number; reps: number | null; weight: number | null };

export type SessionExercise = {
  exerciseId: string;
  name: { ar: string; en: string } | null;
  groups: SetGroup[];
  /** Heaviest weight lifted in this session, null when no weighted set. */
  topWeight: number | null;
};

/** One entry per exercise, with consecutive identical sets collapsed:
 * 8×60, 8×60, 8×60 becomes {sets: 3, reps: 8, weight: 60}. */
export function sessionExercises(session: HistorySession): SessionExercise[] {
  const byExercise = new Map<string, SessionExercise>();
  const logs = [...session.workout_set_logs].sort((a, b) => a.set_index - b.set_index);
  for (const log of logs) {
    if (!log.exercise_id) continue;
    let entry = byExercise.get(log.exercise_id);
    if (!entry) {
      entry = {
        exerciseId: log.exercise_id,
        name: log.exercises ? { ar: log.exercises.name_ar, en: log.exercises.name_en } : null,
        groups: [],
        topWeight: null,
      };
      byExercise.set(log.exercise_id, entry);
    }
    const last = entry.groups[entry.groups.length - 1];
    if (last && last.reps === log.reps && last.weight === log.weight) last.sets += 1;
    else entry.groups.push({ sets: 1, reps: log.reps, weight: log.weight });
    if (log.weight != null && (entry.topWeight == null || log.weight > entry.topWeight)) entry.topWeight = log.weight;
  }
  return [...byExercise.values()];
}

/** Chart input: the heaviest set of each session, oldest first. */
export function topSetsBySession(series: ExerciseSeriesPoint[]): { date: string; value: number }[] {
  const best = new Map<string, { date: string; value: number }>();
  for (const p of series) {
    if (p.weight == null || p.weight <= 0) continue;
    const cur = best.get(p.session_id);
    if (!cur || p.weight > cur.value) best.set(p.session_id, { date: p.completed_at, value: p.weight });
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type ComparisonRow = {
  exerciseId: string;
  name: SessionExercise["name"];
  a: number | null;
  b: number | null;
  diffKg: number | null;
  /** null when A is missing or 0 (a percentage of nothing). */
  diffPct: number | null;
};

/** Top weight per exercise in session A vs B. diff = B − A, so picking the
 * older session as A reads as progress. Exercises done in only one session
 * still appear, with no diff. */
export function compareSessions(a: HistorySession, b: HistorySession): ComparisonRow[] {
  const exA = new Map(sessionExercises(a).map((e) => [e.exerciseId, e]));
  const exB = new Map(sessionExercises(b).map((e) => [e.exerciseId, e]));
  const ids = new Set([...exA.keys(), ...exB.keys()]);
  return [...ids].map((exerciseId) => {
    const ea = exA.get(exerciseId);
    const eb = exB.get(exerciseId);
    const wa = ea?.topWeight ?? null;
    const wb = eb?.topWeight ?? null;
    const diffKg = wa != null && wb != null ? Math.round((wb - wa) * 100) / 100 : null;
    const diffPct = diffKg != null && wa! > 0 ? Math.round((diffKg / wa!) * 1000) / 10 : null;
    return { exerciseId, name: (ea ?? eb)!.name, a: wa, b: wb, diffKg, diffPct };
  });
}
