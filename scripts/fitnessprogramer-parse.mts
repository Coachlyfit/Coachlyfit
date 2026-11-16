// Shared by fitnessprogramer-workouts.mts and fitnessprogramer-plans.mts: parses ONE cached
// /workout/<slug>/ page into rows (name, sets, reps, rest, supersets, warm-up) matched
// against our global exercise library. Pure: no network, no file access.
import { JSDOM } from "jsdom";
import {
  matchEquivalent,
  matchExercise,
  type GlobalExercise,
  type Match,
} from "../src/domain/programs/platform/exercise-match";
import { groupSupersets, parseRest, parseSets, type ScrapedSet } from "../src/domain/programs/platform/scraped-sets";

// site taxonomy slug -> programs.categories value
const CATEGORY: Record<string, string> = {
  "full-body": "full_body",
  strength: "strength",
  "fat-burning": "fat_burning",
  "at-home": "at_home",
  "body-weight": "body_weight",
  "core-abs": "core",
  leg: "legs",
  chest: "chest",
  "back-wing": "back",
  shoulder: "shoulders",
  arms: "arms",
  hip: "glutes",
};
// site equipment label -> PLAN_EQUIPMENT value; everything else is dropped
const EQUIPMENT: Record<string, string> = {
  barbell: "barbell",
  dumbbell: "dumbbell",
  "body weight": "body weight",
  "body only": "body weight",
  cable: "cable",
  machine: "machine",
  kettlebell: "kettlebell",
  band: "band",
  "resistance band": "band",
  "medicine ball": "medicine ball",
  rope: "rope",
};
export const LEVEL_ORDER = ["beginner", "intermediate", "advanced"];

/** Site values the maps above didn't know, for the scripts' reports. */
export const unmappedCategories = new Set<string>();
export const unmappedEquipment = new Set<string>();

const text = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
const spec = (a: Element, c: string) => {
  const t = text(a.querySelector(`.spec.${c} span`));
  return t || null;
};

export type Row = {
  n: number;
  name: string;
  site_slug: string;
  gif: string | null;
  equipment_raw: string[];
  sets_raw: string | null;
  reps_raw: string | null;
  rest_raw: string | null;
  note_raw: string | null;
  match: Match | null;
  sets: ScrapedSet[] | null;
  rest_seconds: number | null;
  group_key: string | null;
  block: "warmup" | "main";
  flags: string[];
};

export type ParsedWorkout = {
  slug: string;
  source_url: string;
  title: string;
  levels: string[];
  level: string | null;
  categories_raw: string[];
  categories: string[];
  days_per_week: number | null;
  equipment: string[];
  exercises: Row[];
  unmatched: string[];
  unparsed: string[];
  status: "no_exercises" | "unmatched" | "unparsed" | "ok";
};

export function parseWorkoutPage(html: string, slug: string, globals: GlobalExercise[]): ParsedWorkout {
  const doc = new JSDOM(html).window.document;
  const root = doc.querySelector(".wpt_workout_single");
  const classes = [...(root?.classList ?? [])];

  const levels = classes
    .filter((c) => c.startsWith("winner_workout_difficulty-"))
    .map((c) => c.replace("winner_workout_difficulty-", "").replace("-level", ""))
    .filter((l) => LEVEL_ORDER.includes(l));
  const categoriesRaw = classes.filter((c) => c.startsWith("winner_workout_goal-")).map((c) => c.replace("winner_workout_goal-", ""));
  const categories = categoriesRaw.flatMap((c) => {
    if (CATEGORY[c]) return [CATEGORY[c]];
    unmappedCategories.add(c);
    return [];
  });
  const freq = text(doc.body).match(/Frequency\s*(\d)\s*Days? per Week/i);

  const rows: Row[] = [];
  const articles = [...doc.querySelectorAll("section.exercises_list article.entry")];
  articles.forEach((a, i) => {
    const href = a.querySelector<HTMLAnchorElement>(".title a")?.href ?? "";
    const gif = a.querySelector("img")?.getAttribute("src") ?? null;
    const name = text(a.querySelector(".title"));
    const equipment_raw = text(a.querySelector(".equipment")).replace(/^Equipment:\s*/i, "").split(",").map((s) => s.trim()).filter(Boolean);
    const sets_raw = spec(a, "sets");
    const reps_raw = spec(a, "reps");
    const rest_raw = spec(a, "rest");
    const note_raw = spec(a, "duration");
    const parsedSets = parseSets(sets_raw, reps_raw);
    const parsedRest = parseRest(rest_raw, note_raw);
    rows.push({
      n: i + 1,
      name,
      site_slug: new URL(href, "https://fitnessprogramer.com").pathname.split("/").filter(Boolean).pop() ?? "",
      gif,
      equipment_raw,
      sets_raw,
      reps_raw,
      rest_raw,
      // the Duration cell doubles as the superset rest; keep it only when it isn't that
      note_raw: parsedRest.marker ? null : note_raw,
      match: matchExercise({ name, gif }, globals) ?? matchEquivalent({ name, gif, equipment: equipment_raw }, globals),
      sets: parsedSets.sets,
      rest_seconds: parsedRest.rest_seconds,
      group_key: null,
      block: parsedSets.flags.includes("warmup") ? "warmup" : "main",
      flags: [...parsedSets.flags, ...parsedRest.flags],
    });
  });

  const grouping = groupSupersets(
    rows.map((r) => ({ marker: parseRest(r.rest_raw, r.note_raw).marker, rest_seconds: r.rest_seconds }))
  );
  rows.forEach((r, i) => {
    r.group_key = grouping.keys[i];
    // a superset's rest (from the closing row) applies to both members
    if (r.group_key) {
      const rest = rows.find((x) => x.group_key === r.group_key && x.rest_seconds != null)?.rest_seconds ?? null;
      r.rest_seconds = rest;
    }
    if (grouping.flags.some((f) => f === `superset_unplaced:${i + 1}`)) r.flags.push("superset_unplaced");
  });

  const equipment = [...new Set(rows.flatMap((r) => r.equipment_raw))]
    .map((e) => e.toLowerCase())
    .flatMap((e) => {
      if (EQUIPMENT[e]) return [EQUIPMENT[e]];
      unmappedEquipment.add(e);
      return [];
    });

  const unmatched = rows.filter((r) => !r.match).map((r) => r.name);
  const unparsed = rows.filter((r) => !r.sets).map((r) => `${r.name} [${r.flags.join("; ") || "no sets"}]`);
  return {
    slug,
    source_url: `https://fitnessprogramer.com/workout/${slug}/`,
    title: text(doc.querySelector("h1")),
    levels,
    level: LEVEL_ORDER.find((l) => levels.includes(l)) ?? null,
    categories_raw: categoriesRaw,
    categories: [...new Set(categories)],
    days_per_week: freq ? Number(freq[1]) : null,
    equipment: [...new Set(equipment)],
    exercises: rows,
    unmatched,
    unparsed,
    status: rows.length === 0 ? "no_exercises" : unmatched.length ? "unmatched" : unparsed.length ? "unparsed" : "ok",
  };
}
