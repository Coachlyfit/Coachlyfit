/** Pure view logic for the Template Library (grid filtering, facets, the sets
 * summary shown on the preview), kept out of the components so it is tested. */

export const LIBRARY_CATEGORIES = [
  "strength", "fat_burning", "full_body", "at_home", "body_weight", "core",
  "legs", "chest", "back", "shoulders", "arms", "glutes",
] as const;
const LEVEL_ORDER = ["beginner", "intermediate", "advanced"];
const GOAL_ORDER = ["muscle", "fat_loss", "strength", "endurance", "performance", "mobility", "general"];

export type TemplateKind = "workout" | "plan";

export type LibraryRow = {
  id: string;
  /** "workout" = one session; "plan" = a multi-week program. */
  kind: TemplateKind;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  level: string | null;
  goal: string | null;
  categories: string[];
  equipment: string[];
  exercises: number;
  days_per_week: number | null;
  duration_weeks: number | null;
  gender_target: string | null;
  /** The coach's newest live copy of this template, if any. */
  copyId: string | null;
};

export type LibraryFilters = {
  q: string;
  category: string | null;
  level: string | null;
  equipment: string | null;
  /** Plan filters: */
  goal: string | null;
  gender: string | null;
  duration: number | null;
};
export const NO_FILTERS: LibraryFilters = {
  q: "",
  category: null,
  level: null,
  equipment: null,
  goal: null,
  gender: null,
  duration: null,
};

/** A plan for women/men is also suitable for "all"; a plan for everyone shows under either filter. */
const matchesGender = (target: string | null, wanted: string) => target === wanted || target === "all";

/** Search matches Arabic and English names/descriptions alike, whichever locale the page is in. */
export function filterTemplates(rows: LibraryRow[], f: LibraryFilters): LibraryRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.category && !r.categories.includes(f.category)) return false;
    if (f.level && r.level !== f.level) return false;
    if (f.equipment && !r.equipment.includes(f.equipment)) return false;
    if (f.goal && r.goal !== f.goal) return false;
    if (f.gender && !matchesGender(r.gender_target, f.gender)) return false;
    if (f.duration && r.duration_weeks !== f.duration) return false;
    if (!q) return true;
    return [r.name_ar, r.name_en, r.description_ar, r.description_en].some((s) => s?.toLowerCase().includes(q));
  });
}

/** Only the filter values that exist in the data, in a stable order. */
export function facets(rows: LibraryRow[]) {
  const has = <T,>(pick: (r: LibraryRow) => T[]) => new Set(rows.flatMap(pick));
  const cats = has((r) => r.categories);
  const levels = has((r) => (r.level ? [r.level] : []));
  const equipment = has((r) => r.equipment);
  const goals = has((r) => (r.goal ? [r.goal] : []));
  const durations = has((r) => (r.duration_weeks ? [r.duration_weeks] : []));
  const genders = has((r) => (r.gender_target ? [r.gender_target] : []));
  return {
    goals: GOAL_ORDER.filter((g) => goals.has(g)),
    durations: [...durations].sort((a, b) => a - b),
    // "all" is a property of a plan, not a choice the coach filters on
    genders: (["female", "male"] as const).filter((g) => genders.has(g) || genders.has("all")),
    categories: LIBRARY_CATEGORIES.filter((c) => cats.has(c)) as string[],
    levels: LEVEL_ORDER.filter((l) => levels.has(l)),
    equipment: [...equipment].sort(),
  };
}

export type SetLike = {
  reps: number | null;
  reps_max: number | null;
  duration_seconds: number | null;
  /** 'amrap' with no other target = "Max" (to failure). */
  set_type?: string | null;
};
export type SetFormat = {
  num: (n: number) => string;
  seconds: (n: number) => string;
  minutes: (n: number) => string;
  max: () => string;
};

const target = (s: SetLike, f: SetFormat): string => {
  if (s.set_type === "amrap" && s.reps == null && s.duration_seconds == null) return f.max();
  if (s.reps != null) return s.reps_max != null && s.reps_max !== s.reps ? `${f.num(s.reps)}–${f.num(s.reps_max)}` : f.num(s.reps);
  const d = s.duration_seconds;
  if (d == null) return "";
  return d >= 120 && d % 60 === 0 ? f.minutes(d / 60) : f.seconds(d);
};

/** "3 × 10–12" when every set is alike, "12 · 10 · 8 · 6" for a pyramid. */
export function summarizeSets(sets: SetLike[], f: SetFormat): string {
  const parts = sets.map((s) => target(s, f)).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.every((p) => p === parts[0]) ? `${f.num(parts.length)} × ${parts[0]}` : parts.join(" · ");
}
