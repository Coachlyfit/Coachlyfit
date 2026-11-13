/** Group formats a coach can put a set of consecutive program items into.
 * `superset` / `circuit` / `giant_set` are plain round-robin groups (the
 * session-order.ts flow); the timed kinds additionally carry a GroupConfig and
 * run on a clock in the client runner (see interval-timer.ts).
 *
 * Mirrors program_items_group_kind_check in
 * 20261114000001_plan_types_and_timed_blocks.sql. */

export const GROUP_KINDS = ["superset", "circuit", "giant_set", "amrap", "emom", "for_time", "tabata"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export const TIMED_GROUP_KINDS = ["amrap", "emom", "for_time", "tabata"] as const;
export type TimedGroupKind = (typeof TIMED_GROUP_KINDS)[number];

export function isTimedKind(kind: string | null | undefined): kind is TimedGroupKind {
  return (TIMED_GROUP_KINDS as readonly string[]).includes(kind ?? "");
}

export function asGroupKind(kind: string | null | undefined): GroupKind | null {
  return (GROUP_KINDS as readonly string[]).includes(kind ?? "") ? (kind as GroupKind) : null;
}

/** Format parameters, stored as jsonb identically on every member of a group.
 * Which keys apply depends on the kind:
 *   amrap    time_cap_s                    (rounds counted live)
 *   emom     interval_s + rounds           (a new round every interval_s)
 *   for_time rounds + optional time_cap_s  (stopwatch, split per round)
 *   tabata   work_s + rest_s + rounds
 */
export type GroupConfig = {
  time_cap_s?: number;
  rounds?: number;
  interval_s?: number;
  work_s?: number;
  rest_s?: number;
};

const CONFIG_KEYS = ["time_cap_s", "rounds", "interval_s", "work_s", "rest_s"] as const;

/** Sensible starting values when a coach picks a timed kind. Null for the
 * untimed kinds (nothing to configure). */
export function defaultGroupConfig(kind: GroupKind): GroupConfig | null {
  switch (kind) {
    case "amrap":
      return { time_cap_s: 600 };
    case "emom":
      return { interval_s: 60, rounds: 10 };
    case "for_time":
      return { rounds: 3, time_cap_s: 900 };
    case "tabata":
      return { work_s: 20, rest_s: 10, rounds: 8 };
    default:
      return null;
  }
}

/** Defensive read of the jsonb column: keeps only known, positive, finite
 * numbers so a hand-edited row can never feed NaN into the timer. */
export function parseGroupConfig(raw: unknown): GroupConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: GroupConfig = {};
  for (const key of CONFIG_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[key] = Math.round(v);
  }
  return out;
}

/** One-line summary for builder chips and the client block header, with the
 * numbers only — callers wrap it in the localized kind label. e.g. AMRAP →
 * "10:00", EMOM → "10 × 1:00", tabata → "8 × 0:20 / 0:10". */
export function formatGroupConfig(kind: GroupKind, cfg: GroupConfig): string {
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  switch (kind) {
    case "amrap":
      return cfg.time_cap_s ? mmss(cfg.time_cap_s) : "";
    case "emom":
      return cfg.rounds && cfg.interval_s ? `${cfg.rounds} × ${mmss(cfg.interval_s)}` : "";
    case "for_time": {
      const parts: string[] = [];
      if (cfg.rounds) parts.push(`${cfg.rounds}×`);
      if (cfg.time_cap_s) parts.push(`≤ ${mmss(cfg.time_cap_s)}`);
      return parts.join(" ");
    }
    case "tabata":
      return cfg.rounds && cfg.work_s ? `${cfg.rounds} × ${mmss(cfg.work_s)} / ${mmss(cfg.rest_s ?? 0)}` : "";
    default:
      return "";
  }
}
