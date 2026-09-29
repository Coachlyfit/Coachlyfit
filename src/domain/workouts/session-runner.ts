/** Pure step logic for the focused (one exercise at a time) session runner.
 * Built on session-order.ts's round-robin expansion, but speaks the 1-based
 * set_index that workout_set_logs and program_item_sets actually store. */

import { expandSessionOrder, isGroupRoundComplete, type SessionOrderItem } from "./session-order";

export type Step = { itemId: string; setIndex: number; groupKey: string | null };
export type IsLogged = (itemId: string, setIndex: number) => boolean;
export type SetValues = { weight: number | null; reps: number | null; duration_seconds: number | null };

export function buildSteps(items: SessionOrderItem[]): Step[] {
  return expandSessionOrder(items).map((s) => ({ ...s, setIndex: s.setIndex + 1 }));
}

/** First unlogged step strictly after `after`, wrapping around — so logging
 * A1 set 1 of a superset lands on A2 set 1, finishing an exercise lands on
 * the next one, and a set skipped earlier is picked up at the end. No
 * `after` = scan from the start. Null once every step is logged. */
export function nextOpenStep(steps: Step[], isLogged: IsLogged, after?: Step | null): Step | null {
  const start = after ? steps.findIndex((s) => s.itemId === after.itemId && s.setIndex === after.setIndex) : -1;
  for (let k = 1; k <= steps.length; k++) {
    const s = steps[(start + k + steps.length) % steps.length];
    if (!isLogged(s.itemId, s.setIndex)) return s;
  }
  return null;
}

/** Ungrouped sets always rest; a superset/circuit only rests once the whole
 * round (every member's set at this index) is logged. `isLogged` must
 * already include the set just completed. */
export function shouldRest(step: Step, items: SessionOrderItem[], isLogged: IsLogged): boolean {
  if (step.groupKey == null) return true;
  const group = items.filter((i) => i.group_key === step.groupKey);
  return isGroupRoundComplete(group, step.setIndex - 1, (id, round) => isLogged(id, round + 1));
}

/** The latest set of this exercise already logged in this workout before
 * `setIndex` — what the dock prefills from before falling back to target. */
export function previousSetLog<T extends { set_index: number }>(itemLogs: T[], setIndex: number): T | null {
  let best: T | null = null;
  for (const log of itemLogs) {
    if (log.set_index < setIndex && (!best || log.set_index > best.set_index)) best = log;
  }
  return best;
}

export function prefillDraft(previous: SetValues | null, target: SetValues): SetValues {
  if (!previous) return target;
  return {
    weight: previous.weight,
    reps: previous.reps ?? target.reps,
    duration_seconds: previous.duration_seconds ?? target.duration_seconds,
  };
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

/** Lenient numeric input: accepts `,` and the Arabic decimal separator `٫`
 * plus Arabic-Indic digits (an `ar` keyboard's inputmode=decimal emits
 * them). Empty/invalid/negative → null. */
export function parseDecimal(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[,٫]/g, ".");
  if (normalized === "") return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function trimNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** ±delta on a text field's value, clamped at 0; weights snap to 0.25. */
export function stepValue(value: string, delta: number, snap = 1): string {
  const next = Math.max(0, (parseDecimal(value) ?? 0) + delta);
  return trimNumber(Math.round(next / snap) * snap);
}

export type ExerciseSummary = { itemId: string; done: number; total: number; topWeight: number | null };

export function exerciseSummaries(
  items: { id: string; setCount: number }[],
  logs: { program_item_id: string; weight: number | null }[]
): ExerciseSummary[] {
  return items.map((item) => {
    const own = logs.filter((l) => l.program_item_id === item.id);
    const weights = own.map((l) => l.weight).filter((w): w is number => w != null);
    return {
      itemId: item.id,
      done: own.length,
      total: item.setCount,
      topWeight: weights.length ? Math.max(...weights) : null,
    };
  });
}

export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
