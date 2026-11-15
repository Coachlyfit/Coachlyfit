// One-off: turn the reviewed JSON into the two seed migrations. NOT part of the app.
//
//   npx tsx scripts/fitnessprogramer-sql.mts <globals.json>
//
// Reads  scripts/data/fitnessprogramer-{workouts,new-exercises,copy}.json
// Writes supabase/migrations/20261118000002_seed_fitnessprogramer_missing_exercises.sql
//        supabase/migrations/20261118000003_seed_platform_templates.sql
// Both are idempotent. Workouts with any row the parser couldn't read are skipped and listed.
import { readFileSync, writeFileSync } from "node:fs";

type SetRow = { reps: number | null; reps_max: number | null; duration_seconds: number | null };
type Row = {
  name: string;
  site_slug: string;
  match: { id: string; name_en: string } | null;
  sets: SetRow[] | null;
  rest_seconds: number | null;
  group_key: string | null;
  block: "warmup" | "main";
  note_raw: string | null;
};
type Workout = {
  slug: string;
  source_url: string;
  level: string | null;
  categories: string[];
  days_per_week: number | null;
  equipment: string[];
  exercises: Row[];
};
type NewExercise = {
  site_slug: string;
  name_en: string;
  gif: string;
  muscle_group: string;
  equipment: string;
  difficulty: string | null;
  measurement_type: string;
  uses: string[];
};

const globals: { id: string; name_en: string }[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
const workouts: Workout[] = JSON.parse(readFileSync("scripts/data/fitnessprogramer-workouts.json", "utf8"));
const newExercises: NewExercise[] = JSON.parse(readFileSync("scripts/data/fitnessprogramer-new-exercises.json", "utf8"));
const copy: {
  name_en_fix: Record<string, string>;
  exercises: Record<string, string>;
  workouts: Record<string, { name_en: string; name_ar: string; description_en: string; description_ar: string }>;
} = JSON.parse(readFileSync("scripts/data/fitnessprogramer-copy.json", "utf8"));

const q = (s: string | null) => (s == null ? "null" : `'${s.replace(/'/g, "''")}'`);
const arr = (a: string[]) => (a.length ? `array[${a.map(q).join(", ")}]::text[]` : "'{}'::text[]");
const problems: string[] = [];

// ---- which workouts are seedable -------------------------------------------
const seedable = workouts.filter((w) => w.exercises.every((r) => r.sets));
const skipped = workouts.filter((w) => !seedable.includes(w));
const ok = new Set(seedable.map((w) => w.slug));
const needed = newExercises.filter((e) => e.uses.some((u) => ok.has(u)));

// ---- 1. missing exercises ---------------------------------------------------
const exName = (e: NewExercise) => copy.name_en_fix[e.name_en] ?? e.name_en;
// a still image (the site had no GIF for it) belongs in image_url, not video_url
const isGif = (e: NewExercise) => /\.gif(\?|$)/i.test(e.gif);
const stills = needed.filter((e) => !isGif(e));
const exerciseRows = needed.map((e) => {
  const ar = copy.exercises[e.name_en];
  if (!ar) problems.push(`no Arabic name for exercise: ${e.name_en}`);
  return `  (${q(ar ?? null)}, ${q(exName(e))}, ${q(e.muscle_group)}, ${q(e.equipment)}, ${q(isGif(e) ? e.gif : null)}, ${q(e.difficulty)}, ${q(e.measurement_type)})`;
});
const exercisesSql = `-- Exercises that the platform template library needs and the global library lacks.
-- Source: https://fitnessprogramer.com/exercise/<slug>/ (muscle group, equipment, GIF).
-- Names are the site's exercise names; Arabic names are an original translation.
-- Idempotent: a row is only inserted when no global exercise already has that name,
-- and existing exercises are never touched.
insert into public.exercises (name_ar, name_en, muscle_group, equipment, video_url, difficulty, measurement_type)
select v.name_ar, v.name_en, v.muscle_group, v.equipment, v.video_url, v.difficulty, v.measurement_type
from (values
${exerciseRows.join(",\n")}
) as v(name_ar, name_en, muscle_group, equipment, video_url, difficulty, measurement_type)
where not exists (
  select 1 from public.exercises e
  where e.coach_id is null and lower(e.name_en) = lower(v.name_en)
);
${stills.map((e) => `
update public.exercises set image_url = ${q(e.gif)}
where coach_id is null and lower(name_en) = lower(${q(exName(e))}) and image_url is null and video_url is null;`).join("")}
`;

// ---- 2. platform templates --------------------------------------------------
// what the migration's lookup resolves: exact-case name first, then the oldest (globals.json is in created_at order)
const resolve = (name: string) =>
  globals.find((g) => g.name_en === name)?.id ?? globals.find((g) => g.name_en.toLowerCase() === name.toLowerCase())?.id;
const newNames = new Map(needed.map((e) => [e.site_slug, exName(e)]));

const GOAL = (cats: string[]) =>
  cats.includes("fat_burning") ? "fat_loss"
  : cats.includes("strength") ? "strength"
  : cats.some((c) => ["chest", "back", "shoulders", "arms", "legs", "glutes", "core"].includes(c)) ? "muscle"
  : "general";

// "Weight %50-70" -> a plain-language note; anything else is reported, not guessed
const note = (raw: string | null): { en: string; ar: string } | null => {
  if (!raw) return null;
  const m = raw.match(/weight\s*%\s*(\d+)\s*-\s*(\d+)/i);
  if (m) return { en: `Use about ${m[1]}–${m[2]}% of your maximum weight.`, ar: `استخدم نحو ${m[1]}–${m[2]}٪ من أقصى وزن لديك.` };
  problems.push(`unhandled note "${raw}"`);
  return null;
};

// One temp function keeps every item to a single short call. It writes the legacy sets/reps snapshot
// the same way ProgramsService.legacySnapshot does, plus the per-set rows.
const HELPER = `create function pg_temp.seed_item(d uuid, ord int, ex text, blk text, gk text, rest int, na text, ne text, s jsonb)
returns void language plpgsql as $f$
declare i uuid; lo int; hi int;
begin
  select coalesce(min((x->>0)::int), 0), coalesce(max(coalesce((x->>1)::int, (x->>0)::int)), 0)
    into lo, hi from jsonb_array_elements(s) x;
  insert into public.program_items (program_day_id, exercise_id, sets, reps, rest_seconds, order_index, block, group_key, group_kind, notes_ar, notes_en)
  values (d,
    (select e.id from public.exercises e where e.coach_id is null and e.archived_at is null and lower(e.name_en) = lower(ex)
       order by (e.name_en = ex) desc, e.created_at, e.id limit 1),
    jsonb_array_length(s), case when lo = hi then lo::text else lo || '-' || hi end, rest, ord, blk, gk,
    case when gk is null then null else 'superset' end, na, ne)
  returning id into i;
  insert into public.program_item_sets (program_item_id, set_index, reps, reps_max, duration_seconds, rest_seconds)
  select i, t.n::int, (t.x->>0)::int, (t.x->>1)::int, (t.x->>2)::int, rest
  from jsonb_array_elements(s) with ordinality as t(x, n);
end
$f$;`;

const plan: object[] = []; // the same data as the SQL below, for the one-off apply script
const blocks = seedable.map((w) => {
  const c = copy.workouts[w.slug];
  if (!c) problems.push(`no copy for workout: ${w.slug}`);
  const equipment = w.equipment.length ? w.equipment : w.categories.some((x) => ["body_weight", "at_home"].includes(x)) ? ["body weight"] : [];
  const planItems: object[] = [];
  const items = w.exercises.map((r, i) => {
    // the exercise the migration will look up by name
    const name = r.match ? r.match.name_en : newNames.get(r.site_slug);
    if (!name) problems.push(`${w.slug}: no exercise name for "${r.name}"`);
    else {
      const found = resolve(name);
      if (r.match && found !== r.match.id) problems.push(`${w.slug}: name lookup for "${name}" would pick a different row than the matched one`);
      if (!r.match && found) problems.push(`${w.slug}: "${name}" already exists in the library (would be reused)`);
    }
    const sets = r.sets!;
    const n = note(r.note_raw);
    // sets as [[reps, reps_max, duration_seconds], ...]
    const setJson = JSON.stringify(sets.map((x) => [x.reps, x.reps_max, x.duration_seconds]));
    planItems.push({
      exercise: name ?? "?",
      block: r.block,
      group_key: r.group_key,
      rest_seconds: r.rest_seconds,
      notes_ar: n?.ar ?? null,
      notes_en: n?.en ?? null,
      sets: sets.map((x) => [x.reps, x.reps_max, x.duration_seconds]),
    });
    return `  perform pg_temp.seed_item(d, ${i}, ${q(name ?? "?")}, ${q(r.block)}, ${q(r.group_key)}, ${r.rest_seconds ?? "null"}, ${q(n?.ar ?? null)}, ${q(n?.en ?? null)}, '${setJson}');`;
  });
  plan.push({
    slug: w.slug,
    source_url: w.source_url,
    name_ar: c?.name_ar ?? null,
    name_en: c?.name_en ?? null,
    description_ar: c?.description_ar ?? null,
    description_en: c?.description_en ?? null,
    level: w.level,
    goal: GOAL(w.categories),
    categories: w.categories,
    equipment,
    days_per_week: w.days_per_week,
    items: planItems,
  });
  return `-- ${w.slug}
do $$
declare p uuid; d uuid; i uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, source_url, name_ar, name_en, description_ar, description_en, level, goal, categories, equipment, days_per_week)
  values (null, null, ${q(w.slug)}, true, ${q(w.source_url)}, ${q(c?.name_ar ?? null)}, ${q(c?.name_en ?? null)}, ${q(c?.description_ar ?? null)}, ${q(c?.description_en ?? null)},
    ${q(w.level)}, ${q(GOAL(w.categories))}, ${arr(w.categories)}, ${arr(equipment)}, ${w.days_per_week ?? "null"})
  on conflict (slug) where coach_id is null do update set
    source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level,
    goal = excluded.goal, categories = excluded.categories, equipment = excluded.equipment, days_per_week = excluded.days_per_week
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    insert into public.program_days (coach_id, client_id, program_id, day_index, order_index, label_ar, label_en)
    values (null, null, p, 1, 0, 'اليوم 1', 'Day 1') returning id into d;
${items.join("\n")}
  end if;
end $$;`;
});

const templatesSql = `-- Platform training templates (coach_id IS NULL, client_id IS NULL), published.
-- Structure (exercises, sets x reps, rest, supersets) follows the workouts listed at
-- https://fitnessprogramer.com/workouts/ ; names and descriptions are original, with
-- Arabic in Modern Standard Arabic. source_url keeps the attribution.
-- Idempotent: upserts by slug; days/items are created only for a template that has none.
-- Skipped on purpose (a row could not be read unambiguously): ${skipped.map((w) => w.slug).join(", ")}.

${HELPER}

${blocks.join("\n\n")}
`;

writeFileSync("supabase/migrations/20261118000002_seed_fitnessprogramer_missing_exercises.sql", exercisesSql);
writeFileSync("supabase/migrations/20261118000003_seed_platform_templates.sql", templatesSql);
writeFileSync("scripts/data/fitnessprogramer-seed-plan.json", JSON.stringify(plan, null, 1));

console.log(`new exercises: ${needed.length}; workouts seeded: ${seedable.length}; skipped: ${skipped.length}`);
console.log("problems:", problems.length ? "\n  " + [...new Set(problems)].join("\n  ") : "none");
