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
  created_at: string;
};

export type LibraryFilters = {
  q: string;
  /** Multi-select groups: empty = no constraint, otherwise OR inside the group (AND across groups). */
  category: string[];
  level: string[];
  equipment: string[];
  /** Plan filters: */
  goal: string[];
  gender: string[];
  duration: number[];
};
export const NO_FILTERS: LibraryFilters = {
  q: "",
  category: [],
  level: [],
  equipment: [],
  goal: [],
  gender: [],
  duration: [],
};

export type LibrarySort = "name" | "newest";
export const DEFAULT_SORT: LibrarySort = "name";

/** A plan for women/men is also suitable for "all"; a plan for everyone shows under either filter. */
const matchesGender = (target: string | null, wanted: string[]) =>
  target != null && (target === "all" || wanted.includes(target));

/** Search matches Arabic and English names/descriptions alike, whichever locale the page is in. */
export function filterTemplates(rows: LibraryRow[], f: LibraryFilters): LibraryRow[] {
  const q = f.q.trim().toLowerCase();
  const anyOf = (wanted: string[], have: string[]) => wanted.length === 0 || wanted.some((w) => have.includes(w));
  return rows.filter((r) => {
    if (!anyOf(f.category, r.categories)) return false;
    if (!anyOf(f.level, r.level ? [r.level] : [])) return false;
    if (!anyOf(f.equipment, r.equipment)) return false;
    if (!anyOf(f.goal, r.goal ? [r.goal] : [])) return false;
    if (f.gender.length > 0 && !matchesGender(r.gender_target, f.gender)) return false;
    if (f.duration.length > 0 && !(r.duration_weeks != null && f.duration.includes(r.duration_weeks))) return false;
    if (!q) return true;
    return [r.name_ar, r.name_en, r.description_ar, r.description_en].some((s) => s?.toLowerCase().includes(q));
  });
}

export function sortTemplates(rows: LibraryRow[], sort: LibrarySort, locale: "ar" | "en"): LibraryRow[] {
  const name = (r: LibraryRow) => (locale === "ar" ? r.name_ar : r.name_en);
  return [...rows].sort(
    sort === "newest"
      ? (a, b) => b.created_at.localeCompare(a.created_at)
      : (a, b) => name(a).localeCompare(name(b), locale)
  );
}

/** Which URL param carries each setting. The two tabs use different keys so both tabs'
 * filters can sit in one URL, and switching tabs doesn't lose either. */
const PARAMS: Record<TemplateKind, Partial<Record<keyof LibraryFilters | "sort", string>>> = {
  workout: { q: "q", category: "category", level: "level", equipment: "equipment", sort: "sort" },
  plan: { q: "p_q", goal: "p_goal", gender: "p_audience", level: "p_level", duration: "p_duration", sort: "p_sort" },
};
const MAX_Q = 100;
const LIST_KEYS = ["category", "level", "equipment", "goal", "gender"] as const;

/** Reads one tab's filters from the URL. Values aren't validated against the data here (see pruneFilters). */
export function parseLibraryFilters(
  search: URLSearchParams,
  kind: TemplateKind
): { filters: LibraryFilters; sort: LibrarySort } {
  const p = PARAMS[kind];
  const get = (k: keyof LibraryFilters | "sort") => (p[k] ? search.get(p[k]) : null);
  const filters: LibraryFilters = { ...NO_FILTERS, q: (get("q") ?? "").trim().slice(0, MAX_Q) };
  for (const k of LIST_KEYS) filters[k] = get(k)?.split(",").filter(Boolean) ?? [];
  filters.duration = (get("duration")?.split(",") ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return { filters, sort: get("sort") === "newest" ? "newest" : DEFAULT_SORT };
}

/** Writes one tab's filters into a copy of `current` (the other tab's params and `kind` are kept). Defaults are omitted. */
export function writeLibraryFilters(
  current: URLSearchParams,
  kind: TemplateKind,
  filters: LibraryFilters,
  sort: LibrarySort
): string {
  const out = new URLSearchParams(current);
  const p = PARAMS[kind];
  const put = (k: keyof LibraryFilters | "sort", value: string) => {
    const key = p[k];
    if (!key) return;
    if (value) out.set(key, value);
    else out.delete(key);
  };
  put("q", filters.q.trim().slice(0, MAX_Q));
  for (const k of LIST_KEYS) put(k, filters[k].join(","));
  put("duration", filters.duration.join(","));
  put("sort", sort === DEFAULT_SORT ? "" : sort);
  return out.toString();
}

/** Drops filter values the data doesn't offer (a stale or hand-edited URL). */
export function pruneFilters(f: LibraryFilters, a: ReturnType<typeof facets>): LibraryFilters {
  const keep = <T,>(have: T[], offered: T[]) => have.filter((v) => offered.includes(v));
  return {
    ...f,
    category: keep(f.category, a.categories),
    level: keep(f.level, a.levels),
    equipment: keep(f.equipment, a.equipment),
    goal: keep(f.goal, a.goals),
    gender: keep(f.gender, a.genders),
    duration: keep(f.duration, a.durations),
  };
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
