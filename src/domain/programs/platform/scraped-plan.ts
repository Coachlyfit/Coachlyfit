/** Pure helpers for turning a scraped fitnessprogramer.com workout *plan* into our
 * program model. Used by the one-off plans script; kept in src/ so it is tested. */

export type PlanDay = {
  /** 1-based, continuous across the whole plan (Day 1 .. Day 7*weeks). */
  day: number;
  title: string;
  /** The linked /workout/<slug>/ page; null for a rest day we don't need to fetch. */
  slug: string | null;
  rest: boolean;
};

/** "4 Weeks" -> 4, "1 Week" -> 1; null when there's no number. */
export function parseDurationWeeks(raw: string | null | undefined): number | null {
  const m = (raw ?? "").match(/(\d+)\s*weeks?/i);
  return m ? Number(m[1]) : null;
}

/** Rest days are titled "REST", "Rest Day" or "Day 3 (REST)" (links are rest-N slugs, never fetched).
 * A real workout that merely mentions rest ("Rest and Recovery Workout") is not one. */
export function isRestTitle(title: string): boolean {
  const t = title.trim().replace(/^day\s*\d+\s*[-:]?\s*/i, "").replace(/^\((.*)\)$/, "$1").trim();
  return /^rest(\s+day)?$/i.test(t);
}

/** "Strength Training 2. Week" / "Power Workout 3.Week" -> "Strength Training" / "Power Workout". */
export function cleanDayTitle(title: string): string {
  return title
    .replace(/\s*\d+\s*\.?\s*week\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The site's "Female, Male" -> "all"; one gender -> that gender; unknown -> null. */
export function genderTarget(raw: string | null | undefined): "female" | "male" | "all" | null {
  const g = (raw ?? "").toLowerCase();
  const female = /\bfemale\b/.test(g);
  const male = /\bmale\b/.test(g.replace(/\bfemale\b/g, ""));
  if (female && male) return "all";
  if (female) return "female";
  if (male) return "male";
  return null;
}

/** "Build Muscle" -> muscle, "Lose Fat" -> fat_loss. When both are listed the first wins. */
export function planGoal(raw: string | null | undefined): "muscle" | "fat_loss" | null {
  const g = (raw ?? "").toLowerCase();
  const muscle = g.indexOf("build muscle");
  const fat = g.indexOf("lose fat");
  if (muscle < 0 && fat < 0) return null;
  if (muscle >= 0 && (fat < 0 || muscle < fat)) return "muscle";
  return "fat_loss";
}

/** Training days in the most common week (ties -> the larger), so one odd week doesn't skew it. */
export function trainingDaysPerWeek(days: PlanDay[], weeks: number): number | null {
  if (weeks <= 0) return null;
  const counts = new Map<number, number>();
  for (let w = 0; w < weeks; w++) {
    const n = days.filter((d) => !d.rest && Math.ceil(d.day / 7) === w + 1).length;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return best && best[0] > 0 ? best[0] : null;
}

const LEVELS = ["beginner", "intermediate", "advanced"];

/** A level named in the title wins ("Advanced Powerlifting"); otherwise the lowest
 * level tagged on any of the plan's workouts; otherwise null. */
export function planLevel(title: string, workoutLevels: string[][]): string | null {
  const t = title.toLowerCase();
  const named = LEVELS.find((l) => new RegExp(`\\b${l}s?\\b`).test(t));
  if (named) return named;
  const found = new Set(workoutLevels.flat());
  return LEVELS.find((l) => found.has(l)) ?? null;
}

/** Each distinct training workout a plan links to, in first-seen order. */
export function uniqueWorkoutSlugs(days: PlanDay[]): string[] {
  return [...new Set(days.filter((d) => !d.rest && d.slug).map((d) => d.slug as string))];
}
