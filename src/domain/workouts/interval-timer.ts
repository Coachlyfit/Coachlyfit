import type { GroupConfig, TimedGroupKind } from "@/domain/programs/group-config";

/** Pure clock maths for timed groups (AMRAP / EMOM / Tabata / For Time). No
 * React, no Date.now(): the hook feeds in elapsed milliseconds, so the same
 * code is testable and keeps counting correctly after the tab was
 * backgrounded (the caller derives elapsed from a wall-clock start). */

export type TimerPhase = { kind: "work" | "rest"; round: number; durationS: number };

/** The fixed phase list for kinds whose structure is known up front. AMRAP and
 * For Time are a single open-ended stretch (rounds are counted by the athlete),
 * so AMRAP is one work phase of `time_cap_s` and For Time has no schedule
 * (`null`) — it runs as a stopwatch, see stopwatchSnapshot. */
export function buildSchedule(kind: TimedGroupKind, cfg: GroupConfig): TimerPhase[] | null {
  switch (kind) {
    case "amrap":
      return cfg.time_cap_s ? [{ kind: "work", round: 1, durationS: cfg.time_cap_s }] : null;
    case "emom": {
      const rounds = cfg.rounds ?? 0;
      const interval = cfg.interval_s ?? 0;
      if (!rounds || !interval) return null;
      return Array.from({ length: rounds }, (_, i) => ({ kind: "work" as const, round: i + 1, durationS: interval }));
    }
    case "tabata": {
      const rounds = cfg.rounds ?? 0;
      const work = cfg.work_s ?? 0;
      const rest = cfg.rest_s ?? 0;
      if (!rounds || !work) return null;
      const phases: TimerPhase[] = [];
      for (let r = 1; r <= rounds; r++) {
        phases.push({ kind: "work", round: r, durationS: work });
        // No trailing rest after the final work interval.
        if (rest > 0 && r < rounds) phases.push({ kind: "rest", round: r, durationS: rest });
      }
      return phases;
    }
    case "for_time":
      return null;
  }
}

export type TimerSnapshot = {
  /** Index into the schedule; schedule.length once finished. */
  phaseIndex: number;
  phase: TimerPhase | null;
  /** Whole seconds left in the current phase (ceil, so 0 only at the boundary). */
  remainingS: number;
  elapsedS: number;
  totalS: number;
  done: boolean;
};

export function scheduleTotalS(schedule: TimerPhase[]): number {
  return schedule.reduce((sum, p) => sum + p.durationS, 0);
}

export function snapshotAt(schedule: TimerPhase[], elapsedMs: number): TimerSnapshot {
  const totalS = scheduleTotalS(schedule);
  const elapsedS = Math.max(0, elapsedMs) / 1000;
  if (elapsedS >= totalS) {
    return { phaseIndex: schedule.length, phase: null, remainingS: 0, elapsedS: totalS, totalS, done: true };
  }
  let acc = 0;
  for (let i = 0; i < schedule.length; i++) {
    const end = acc + schedule[i].durationS;
    if (elapsedS < end) {
      return { phaseIndex: i, phase: schedule[i], remainingS: Math.ceil(end - elapsedS), elapsedS, totalS, done: false };
    }
    acc = end;
  }
  // Unreachable (elapsedS < totalS) — keeps the return type total.
  return { phaseIndex: schedule.length, phase: null, remainingS: 0, elapsedS: totalS, totalS, done: true };
}

/** For Time: counts up; `capped` flips once an optional time cap is reached. */
export function stopwatchSnapshot(elapsedMs: number, timeCapS?: number) {
  const elapsedS = Math.max(0, Math.floor(elapsedMs / 1000));
  return { elapsedS, capped: timeCapS != null && elapsedS >= timeCapS };
}

/** Split times (seconds) from cumulative lap marks: [30, 75, 130] → [30, 45, 55]. */
export function splitsFromMarks(marksS: number[]): number[] {
  return marksS.map((m, i) => m - (i > 0 ? marksS[i - 1] : 0));
}

/** m:ss, or h:mm:ss from an hour up — shared by the timer face and result chips. */
export function formatClock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
