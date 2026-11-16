// One-off: for every workout exercise our library doesn't have, read its cached
// /exercise/<slug>/ page (see fitnessprogramer-exercises-fetch.mts) and write
// scripts/data/fitnessprogramer-new-exercises.json for review. No network access.
//
//   npx tsx scripts/fitnessprogramer-new-exercises.mts <cacheDir> [workouts.json] [out.json]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { JSDOM } from "jsdom";

const [cacheDir, workoutsPath = "scripts/data/fitnessprogramer-workouts.json", outPath = "scripts/data/fitnessprogramer-new-exercises.json"] =
  process.argv.slice(2);
if (!cacheDir) throw new Error("usage: fitnessprogramer-new-exercises.mts <cacheDir> [workouts.json] [out.json]");

type Row = {
  name: string;
  site_slug: string;
  gif: string | null;
  equipment_raw: string[];
  sets: { duration_seconds: number | null }[] | null;
  match: unknown;
};
// Input is either the workouts JSON, or the plans JSON (each plan carries its workouts by slug).
const input: { slug: string; exercises?: Row[]; workouts?: Record<string, { slug: string; exercises: Row[] }> }[] = JSON.parse(
  readFileSync(workoutsPath, "utf8")
);
const fromPlans = input.some((x) => x.workouts);
const workouts: { slug: string; exercises: Row[] }[] = input.flatMap((x) =>
  x.workouts ? Object.values(x.workouts) : [x as { slug: string; exercises: Row[] }]
);

// site primary-muscle slug -> exercises.muscle_group (see library/taxonomy.ts)
const MUSCLE: Record<string, string> = {
  chest: "chest", abs: "core", core: "core", hip: "hips", glutes: "glutes", glute: "glutes",
  back: "back", lats: "back", "back-wing": "back", shoulders: "shoulders", shoulder: "shoulders",
  biceps: "biceps", triceps: "triceps", forearm: "forearm", forearms: "forearm", arms: "arms",
  neck: "neck", trapezius: "trapezius", calves: "calf", calf: "calf",
  legs: "legs", leg: "legs", quadriceps: "legs", thigh: "legs", hamstring: "legs", hamstrings: "legs",
  cardio: "cardio", "full-body": "full_body",
};
// site equipment slug -> exercises.equipment (EQUIPMENT in library/taxonomy.ts); gym/none markers are skipped
const EQUIPMENT: Record<string, string> = {
  barbell: "barbell", dumbbells: "dumbbell", dumbbell: "dumbbell", cable: "cable", machine: "machine",
  kettlebell: "kettlebell", band: "band", "resistance-band": "band", "medicine-ball": "medicine ball",
  rope: "rope", "stability-ball": "stability ball", "exercise-ball": "stability ball", bench: null as unknown as string,
};

// The site's primary-muscle tag is wrong for these (e.g. a hamstring stretch tagged "calf"); corrected by hand.
const MUSCLE_OVERRIDE: Record<string, string> = {
  "Inner Thigh Side Stretch": "legs",
  "Standing Cross Leg Hamstring Stretch": "legs",
  "Glute Bridge": "glutes",
  "Single Leg Bridge": "glutes",
  "Donkey Kicks": "glutes",
  "Fire Hydrant": "glutes",
  "Bodyweight Single Leg Deadlift": "glutes",
  "Bodyweight Sumo Squat": "legs",
  "Cossack Squat": "legs",
  "Reverse Lunge Knee Lift": "legs",
  "Duck Walk": "legs",
  "Step Up with Knee Raises": "legs",
  "High Knee Skips": "cardio",
  "Elbow To Knee Twists": "core",
  "Arm Leg Raises": "core",
  "Bodyweight Skull Crushers": "triceps",
  "Hindu Push-ups": "chest",
  // plans batch: the site tags lunges/squats as hips and misses the glute machines
  "Bodyweight Lunge": "legs",
  "Plie Dumbbell Squat": "legs",
  "Decline Bench Dumbbell Lunge": "legs",
  "Exercise Ball Wall Squat": "legs",
  "Banded Glute Kickbacks": "glutes",
  "Glute Kickback Machine": "glutes",
  "Push Press": "shoulders",
  "Wall Slides": "shoulders",
  "Shoulder Stretch Behind The Back": "shoulders",
  "Across Chest Shoulder Stretch": "shoulders",
};
// Held or timed by nature, whatever one workout prescribes.
const TIMED_BY_NATURE = /^side plank$|hold|stretch|walk|^running$|fast feet|skip|wall slide/i;

const unmapped = { muscle: new Set<string>(), equipment: new Set<string>() };
const bySlug = new Map<string, { row: Row; timed: boolean; uses: string[] }>();
for (const w of workouts)
  for (const r of w.exercises) {
    if (r.match) continue;
    if (fromPlans && !r.sets) continue; // a row dropped for an unreadable value doesn't need its exercise created
    const e = bySlug.get(r.site_slug) ?? { row: r, timed: false, uses: [] };
    e.timed ||= (r.sets ?? []).some((s) => s.duration_seconds != null);
    e.uses.push(w.slug);
    bySlug.set(r.site_slug, e);
  }

const out = [];
for (const [slug, { row, uses }] of bySlug) {
  const file = `${cacheDir}/exercise-${slug}.html`;
  if (!existsSync(file)) {
    out.push({ site_slug: slug, name_en: row.name, error: "page_not_cached", uses });
    continue;
  }
  const doc = new JSDOM(readFileSync(file, "utf8")).window.document;
  const classes = [...doc.querySelectorAll("[class*='winner_exercise_']")].flatMap((e) => [...e.classList]);
  const tax = (prefix: string) => [...new Set(classes.filter((c) => c.startsWith(prefix)).map((c) => c.slice(prefix.length)))];

  const muscleSlugs = tax("winner_exercise_pri_muscle-");
  const muscles = muscleSlugs.map((m) => MUSCLE[m]).filter(Boolean);
  for (const m of muscleSlugs) if (!MUSCLE[m]) unmapped.muscle.add(m);
  const secondary = tax("winner_exercise_sec_muscle-").map((m) => MUSCLE[m]).filter(Boolean);

  const equipSlugs = tax("winner_exercise_equipment-");
  const equipment = equipSlugs.map((e) => EQUIPMENT[e]).filter(Boolean);
  for (const e of equipSlugs) if (!(e in EQUIPMENT) && !["full-gym", "no-equipment"].includes(e)) unmapped.equipment.add(e);
  const bodyweight = equipSlugs.includes("no-equipment");

  const difficulty = tax("winner_exercise_difficulty-")[0] ?? null;
  const gif = [...doc.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "").find((s) => /\.gif/i.test(s)) ?? row.gif;

  out.push({
    site_slug: slug,
    name_en: row.name,
    gif,
    muscle_group: MUSCLE_OVERRIDE[row.name] ?? muscles[0] ?? null,
    primary_muscles: MUSCLE_OVERRIDE[row.name] ? [MUSCLE_OVERRIDE[row.name]] : muscles,
    secondary_muscles: secondary,
    equipment: equipment[0] ?? (bodyweight ? "body weight" : "none"),
    difficulty: ["beginner", "intermediate", "advanced"].includes(difficulty ?? "") ? difficulty : null,
    measurement_type:
      TIMED_BY_NATURE.test(row.name)
        ? "duration"
        : (equipment.length === 0 && bodyweight) || equipment[0] === "stability ball"
          ? "bodyweight_reps"
          : "weight_reps",
    uses,
  });
}
writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log(`${out.length} new exercises -> ${outPath}`);
console.log("unmapped:", { muscle: [...unmapped.muscle], equipment: [...unmapped.equipment] });
console.log("no muscle group:", out.filter((o) => !("muscle_group" in o) || !o.muscle_group).map((o) => o.name_en));
console.log("not cached:", out.filter((o) => "error" in o).map((o) => o.name_en));
for (const o of out) if ("muscle_group" in o) console.log(`${String(o.name_en).padEnd(40)} ${String(o.muscle_group).padEnd(10)} ${String(o.equipment).padEnd(12)} ${o.measurement_type}`);
