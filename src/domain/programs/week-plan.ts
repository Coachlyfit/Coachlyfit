/** Authored week plan (periodization): per-week modifiers applied on top of
 * week 1's base sets and each item's progression rule. Stored as jsonb on
 * programs.week_plan, keyed by week number as text ("2".."12"):
 *   { "3": { label_en: "Peak", label_ar: "ذروة", load_pct: 105 }, "4": { label_en: "Deload", label_ar: "تخفيف", load_pct: 60, deload: true } }
 * A null plan keeps the original behaviour: every 4th week is a plain deload
 * (the base sets, no progression). Week 1 is the editable base and has no entry. */

export type WeekModifier = {
  /** Short names shown on the week selector and the athlete's session ("Deload",
   * "Peak"), one per language; the viewer sees theirs (see weekLabel). */
  label_ar?: string;
  label_en?: string;
  /** Older single-language label: still read (and shown to both languages) when
   * the per-language ones are absent, never written by the app any more. */
  label?: string;
  /** Load multiplier in percent (100 = as progressed). Skipped for bodyweight and assisted sets. */
  load_pct?: number;
  /** Added to every rep target (and the top of a rep range) that week. */
  reps_delta?: number;
  /** Reset to the base sets before the modifiers apply — no progression that week. */
  deload?: boolean;
};

export type WeekPlan = Record<string, WeekModifier>;

export const FIRST_PLAN_WEEK = 2;
export const LAST_PLAN_WEEK = 12;
const DEFAULT_DELOAD_INTERVAL = 4;

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Defensive read of the jsonb column: keeps only weeks 2..12 and known,
 * in-range fields, so a hand-edited row can never feed NaN into a projection.
 * Null (or an empty plan) means "no authored plan". */
export function parseWeekPlan(raw: unknown): WeekPlan | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: WeekPlan = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const week = Number(key);
    if (!Number.isInteger(week) || week < FIRST_PLAN_WEEK || week > LAST_PLAN_WEEK) continue;
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const mod: WeekModifier = {};
    for (const key of ["label", "label_ar", "label_en"] as const) {
      const text = v[key];
      if (typeof text === "string" && text.trim()) mod[key] = text.trim().slice(0, 40);
    }
    if (finite(v.load_pct) && v.load_pct >= 40 && v.load_pct <= 150) mod.load_pct = Math.round(v.load_pct);
    if (finite(v.reps_delta) && v.reps_delta >= -10 && v.reps_delta <= 10) mod.reps_delta = Math.round(v.reps_delta);
    if (v.deload === true) mod.deload = true;
    if (Object.keys(mod).length > 0) out[String(week)] = mod;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function modifierForWeek(plan: WeekPlan | null | undefined, week: number): WeekModifier | null {
  return plan?.[String(week)] ?? null;
}

/** The week's name in the viewer's language: their own label, else the other
 * language's, else the legacy single label, else null. */
export function weekLabel(mod: WeekModifier | null | undefined, locale: "ar" | "en"): string | null {
  if (!mod) return null;
  const own = locale === "ar" ? mod.label_ar : mod.label_en;
  const other = locale === "ar" ? mod.label_en : mod.label_ar;
  return own ?? mod.label ?? other ?? null;
}

/** Whether `week` resets to the base sets: an authored plan says so per week;
 * without one, every 4th week does. Week 1 is the base itself. */
export function isDeloadWeek(plan: WeekPlan | null | undefined, week: number): boolean {
  if (week <= 1) return false;
  return plan ? !!plan[String(week)]?.deload : week % DEFAULT_DELOAD_INTERVAL === 0;
}

export type BilingualLabel = { ar: string; en: string };

/** A 4-week mesocycle repeated across the program: three build weeks, then a
 * deload at 60% load. Labels are per language so the plan reads correctly for
 * an Arabic or an English viewer; pass none for an unlabelled plan (a deload
 * week then shows the app's own translated "Deload"). */
export function mesocyclePlan(labels?: { build: BilingualLabel; deload: BilingualLabel }): WeekPlan {
  const plan: WeekPlan = {};
  for (let week = FIRST_PLAN_WEEK; week <= LAST_PLAN_WEEK; week++) {
    const deload = week % DEFAULT_DELOAD_INTERVAL === 0;
    const label = deload ? labels?.deload : labels?.build;
    const names = label ? { label_ar: label.ar, label_en: label.en } : {};
    plan[String(week)] = deload ? { ...names, load_pct: 60, deload: true } : { ...names, reps_delta: 0 };
  }
  return plan;
}
