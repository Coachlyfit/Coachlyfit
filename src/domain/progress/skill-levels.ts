/** Calisthenics skill ladders: an exercise can be one rung of a ladder
 * (exercises.skill_group / skill_level, e.g. planche 1 "Planche Lean" ... 5
 * "Full Planche"). An athlete's level in a ladder is the highest rung they have
 * logged a set of. Derived on read from the logs — nothing is stored, same
 * approach as prs.ts. */

export const SKILL_GROUPS = [
  "push_up",
  "pull_up",
  "muscle_up",
  "planche",
  "front_lever",
  "handstand",
  "pistol_squat",
  "l_sit",
] as const;
export type SkillGroup = (typeof SKILL_GROUPS)[number];

export type SkillRung = {
  id: string;
  name_ar: string;
  name_en: string;
  group: SkillGroup;
  level: number;
};

export type SkillLadder = {
  group: SkillGroup;
  /** Every rung of the ladder, lowest first, flagged by whether it has been logged. */
  rungs: (SkillRung & { reached: boolean })[];
  /** Highest rung logged. */
  reachedLevel: number;
  /** The rung after the highest reached one; null at the top of the ladder. */
  next: SkillRung | null;
};

/** The DB stores group/level as plain text/int; this narrows a row to a rung
 * (null for a row with no, or an unknown, ladder). */
export function toSkillRung(row: {
  id: string;
  name_ar: string;
  name_en: string;
  skill_group: string | null;
  skill_level: number | null;
}): SkillRung | null {
  if (row.skill_level == null || !(SKILL_GROUPS as readonly string[]).includes(row.skill_group ?? "")) return null;
  return {
    id: row.id,
    name_ar: row.name_ar,
    name_en: row.name_en,
    group: row.skill_group as SkillGroup,
    level: row.skill_level,
  };
}

/** One ladder per group the athlete has logged at least one rung of, in the
 * fixed SKILL_GROUPS order. `loggedExerciseIds` = exercises with a real logged
 * set (see hasLoggedEffort). Duplicate rungs at the same level (the library can
 * hold two rows with the same name) collapse into the first. */
export function computeSkillLadders(rungs: SkillRung[], loggedExerciseIds: Set<string>): SkillLadder[] {
  const ladders: SkillLadder[] = [];
  for (const group of SKILL_GROUPS) {
    const seen = new Set<number>();
    const ladder = rungs
      .filter((r) => r.group === group)
      .sort((a, b) => a.level - b.level)
      .filter((r) => (seen.has(r.level) ? false : (seen.add(r.level), true)));
    // A level counts as reached when ANY exercise at that level was logged.
    const loggedLevels = new Set(
      rungs.filter((r) => r.group === group && loggedExerciseIds.has(r.id)).map((r) => r.level)
    );
    if (loggedLevels.size === 0) continue;

    const reachedLevel = Math.max(...loggedLevels);
    ladders.push({
      group,
      rungs: ladder.map((r) => ({ ...r, reached: loggedLevels.has(r.level) })),
      reachedLevel,
      next: ladder.find((r) => r.level > reachedLevel) ?? null,
    });
  }
  return ladders;
}

/** A logged set counts toward a skill when something was actually done: at
 * least one rep or one second held. */
export function hasLoggedEffort(log: { reps: number | null; duration_seconds?: number | null }): boolean {
  return (log.reps ?? 0) > 0 || (log.duration_seconds ?? 0) > 0;
}
