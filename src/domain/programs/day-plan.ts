import { dayIndexForDateWithMode, weekIndexForDate, type ScheduleMode } from "./program-cycle";
import type { ProgramTree } from "./programs.service";
import { primaryDays, sessionsOf } from "./day-sessions";

type ProgramDay = ProgramTree["program_days"][number];
type ProgramItem = ProgramDay["program_items"][number];
type RehabProtocol = ProgramTree["rehab_protocols"][number];
type RehabPhase = RehabProtocol["rehab_phases"][number];

export type DayKind = "training" | "rest" | "cardio" | "rehab";

export type ResolvedDayPlan = {
  day: ProgramDay | null;
  /** The day's extra sessions (an AM/PM split): other program_days that point at
   * `day`. Empty for a rest day or a one-session day. */
  sessions: ProgramDay[];
  /** 1-based training week (program-cycle.ts's weekIndexForDate), used to
   * both project sets (progression.ts) and pick each rehab phase's active
   * window below. */
  week: number;
  kind: DayKind;
  /** block NOT IN ('mobility','rehab') — warm-up, main, accessory, finisher, cool-down. */
  workoutItems: ProgramItem[];
  /** block = 'mobility' — standalone mobility work, not tied to a rehab
   * protocol/phase. */
  mobilityItems: ProgramItem[];
  /** block = 'rehab' AND (no phase set, OR that item's phase is active
   * this week) — an item whose phase has ended or not yet started is
   * hidden, same "absence is the signal" idiom the rest of this schema
   * uses. */
  rehabItems: ProgramItem[];
  activities: ProgramDay["program_activities"];
  /** Every protocol on the program, each annotated with which phase (if
   * any) is active this week — shown even on a day with no rehab items, so
   * the client always sees their current phase/restrictions. */
  protocols: (RehabProtocol & { activePhase: RehabPhase | null })[];
  dietPlanId: string | null;
};

/** Which phase of a protocol covers a given training week — the first
 * phase whose [from_week, to_week] contains it, or null if the week falls
 * in a gap (or the protocol has no phases yet). Phases aren't required to
 * be contiguous or ordered on read, so this scans rather than indexing. */
export function activePhase(protocol: RehabProtocol, week: number): RehabPhase | null {
  return protocol.rehab_phases.find((p) => week >= p.from_week && week <= p.to_week) ?? null;
}

/** Resolves everything about one calendar day of a program: which
 * program_day (if any) is scheduled, its training week, and every
 * component split into the five day-agenda sections the coach/client UIs
 * render (workout, mobility, rehab, cardio+recovery, nutrition). A day
 * with no items and no activities is a rest day — no separate flag, same
 * idiom program-cycle.ts already uses for "no program_day this date". */
export function resolveDayPlan(tree: ProgramTree, targetDate: string): ResolvedDayPlan {
  const week = weekIndexForDate(tree.start_date, targetDate);

  // Only primary days sit on the calendar; extra sessions hang off them.
  const calendarDays = primaryDays(tree.program_days);
  const weekdayToDayIndex = new Map<number, number>();
  for (const d of calendarDays) {
    if (d.weekday != null) weekdayToDayIndex.set(d.weekday, d.day_index);
  }
  const dayIndex = dayIndexForDateWithMode(
    tree.schedule_mode as ScheduleMode,
    tree.start_date,
    calendarDays.length,
    targetDate,
    weekdayToDayIndex
  );
  const day = dayIndex == null ? null : (calendarDays.find((d) => d.day_index === dayIndex) ?? null);

  const protocols = tree.rehab_protocols.map((protocol) => ({ ...protocol, activePhase: activePhase(protocol, week) }));
  const activePhaseIds = new Set(protocols.map((p) => p.activePhase?.id).filter((id): id is string => id != null));

  const items = day?.program_items ?? [];
  // Everything that is not mobility/rehab is ordinary session work: warm-up,
  // main, accessory, finisher, cool-down.
  const workoutItems = items.filter((i) => i.block !== "mobility" && i.block !== "rehab");
  const mobilityItems = items.filter((i) => i.block === "mobility");
  const rehabItems = items.filter(
    (i) => i.block === "rehab" && (i.rehab_phase_id == null || activePhaseIds.has(i.rehab_phase_id))
  );
  const activities = day?.program_activities ?? [];

  let kind: DayKind = "rest";
  if (workoutItems.length > 0) kind = "training";
  else if (rehabItems.length > 0 || mobilityItems.length > 0) kind = "rehab";
  else if (activities.length > 0) kind = "cardio";

  return {
    day,
    sessions: day ? sessionsOf(tree.program_days, day.id) : [],
    week,
    kind,
    workoutItems,
    mobilityItems,
    rehabItems,
    activities,
    protocols,
    dietPlanId: day?.diet_plan_id ?? null,
  };
}
