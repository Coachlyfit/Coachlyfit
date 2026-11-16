// One-off: turn the reviewed plans JSON into seed migrations. NOT part of the app.
//
//   npx tsx scripts/fitnessprogramer-plans-sql.mts <globals.json>
//
// Reads  scripts/data/fitnessprogramer-{plans,plan-new-exercises,plans-copy}.json
// Writes supabase/migrations/20261121000002_seed_fitnessprogramer_plan_exercises.sql
//        supabase/migrations/20261121000003_seed_platform_plans.sql
//        scripts/data/fitnessprogramer-plans-seed-plan.json   (the same data, for fitnessprogramer-plans-apply.mts)
// Idempotent. A row the parser couldn't read unambiguously is dropped from its session and listed.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

type SetRow = { reps: number | null; reps_max: number | null; duration_seconds: number | null; to_failure?: boolean };
type Row = {
  name: string;
  site_slug: string;
  match: { id: string; name_en: string } | null;
  sets: SetRow[] | null;
  rest_seconds: number | null;
  group_key: string | null;
  block: "warmup" | "main";
  note_raw: string | null;
  flags: string[];
};
type Workout = { slug: string; exercises: Row[] };
type Plan = {
  slug: string;
  source_url: string;
  title: string;
  weeks_found: number;
  goal: string | null;
  gender_target: string | null;
  level: string | null;
  days_per_week: number | null;
  categories: string[];
  equipment: string[];
  days: { day: number; title: string; slug: string | null; rest: boolean; clean_title: string }[];
  workouts: Record<string, Workout>;
};
type NewExercise = {
  site_slug: string;
  name_en: string;
  gif: string;
  muscle_group: string;
  equipment: string;
  difficulty: string | null;
  measurement_type: string;
};

const globals: { id: string; name_en: string }[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
const plans: Plan[] = JSON.parse(readFileSync("scripts/data/fitnessprogramer-plans.json", "utf8"));
const newExercises: NewExercise[] = JSON.parse(readFileSync("scripts/data/fitnessprogramer-plan-new-exercises.json", "utf8"));
const copy: {
  rest: { en: string; ar: string };
  goal_override: Record<string, string>;
  name_en_fix: Record<string, string>;
  exercises: Record<string, string>;
  plans: Record<string, { name_en: string; name_ar: string; description_en: string; description_ar: string }>;
  day_titles: Record<string, { en: string; ar: string }>;
} = JSON.parse(readFileSync("scripts/data/fitnessprogramer-plans-copy.json", "utf8"));

const q = (s: string | null) => (s == null ? "null" : `'${s.replace(/'/g, "''")}'`);
const arr = (a: string[]) => (a.length ? `array[${a.map(q).join(", ")}]::text[]` : "'{}'::text[]");
const problems: string[] = [];
const dropped: string[] = [];

// ---- 1. exercises -----------------------------------------------------------------
const exName = (e: NewExercise) => copy.name_en_fix[e.name_en] ?? e.name_en;
const isGif = (e: NewExercise) => /\.gif(\?|$)/i.test(e.gif);
const stills = newExercises.filter((e) => !isGif(e));
const exerciseRows = newExercises.map((e) => {
  const ar = copy.exercises[e.name_en];
  if (!ar) problems.push(`no Arabic name for exercise: ${e.name_en}`);
  if (globals.some((g) => g.name_en.toLowerCase() === exName(e).toLowerCase())) problems.push(`"${exName(e)}" already exists in the library`);
  return `  (${q(ar ?? null)}, ${q(exName(e))}, ${q(e.muscle_group)}, ${q(e.equipment)}, ${q(isGif(e) ? e.gif : null)}, ${q(e.difficulty)}, ${q(e.measurement_type)})`;
});
const exercisesSql = `-- Exercises the platform plans need and the global library lacks (a second batch after
-- 20261118000002). Source: https://fitnessprogramer.com/exercise/<slug>/ (muscle group, equipment, GIF).
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
${stills.map((e) => `\nupdate public.exercises set image_url = ${q(e.gif)}\nwhere coach_id is null and lower(name_en) = lower(${q(exName(e))}) and image_url is null and video_url is null;`).join("")}
`;

// ---- 2. plans -------------------------------------------------------------------------
const newBySlug = new Map(newExercises.map((e) => [e.site_slug, exName(e)]));
const resolve = (name: string) =>
  globals.find((g) => g.name_en === name)?.id ?? globals.find((g) => g.name_en.toLowerCase() === name.toLowerCase())?.id;

const note = (r: Row): { en: string; ar: string } | null => {
  if (r.flags.includes("sprint")) return { en: "Sprint.", ar: "عدو سريع." };
  const m = r.note_raw?.match(/weight\s*%\s*(\d+)\s*-\s*(\d+)/i);
  if (m) return { en: `Use about ${m[1]}–${m[2]}% of your maximum weight.`, ar: `استخدم نحو ${m[1]}–${m[2]}٪ من أقصى وزن لديك.` };
  // a bare number with no unit (e.g. "60") has no reliable meaning: leave the note out rather than guess
  if (r.note_raw && /^\d+$/.test(r.note_raw.trim())) return null;
  const secs = r.note_raw?.match(/^(\d+)\s*sec$/i);
  if (secs) return { en: `Work for about ${secs[1]} seconds.`, ar: `أدِّه لنحو ${secs[1]} ثانية.` };
  const rm = r.note_raw?.match(/1rm\s*-?\s*%?\s*(\d+)(?:\s*-\s*(\d+))?/i);
  if (rm) {
    const range = rm[2] ? `${rm[1]}–${rm[2]}` : rm[1];
    return { en: `Use about ${range}% of your one-rep max.`, ar: `استخدم نحو ${range}٪ من أقصى وزن لتكرار واحد.` };
  }
  if (r.note_raw) problems.push(`unhandled note "${r.note_raw}" on ${r.name}`);
  return null;
};

type Item = {
  e: string;
  b: string;
  g: string | null;
  r: number | null;
  na: string | null;
  ne: string | null;
  s: [number | null, number | null, number | null, 0 | 1][];
};

function sessionItems(plan: Plan, w: Workout): Item[] {
  const items: Item[] = [];
  for (const r of w.exercises) {
    if (!r.sets) {
      dropped.push(`${plan.slug} / ${w.slug}: ${r.name} (${r.flags.join("; ")})`);
      continue;
    }
    const name = r.match ? r.match.name_en : newBySlug.get(r.site_slug);
    if (!name) {
      problems.push(`${plan.slug}/${w.slug}: no exercise for "${r.name}"`);
      continue;
    }
    if (r.match) {
      const found = resolve(name);
      if (found !== r.match.id) problems.push(`${plan.slug}/${w.slug}: name lookup for "${name}" would pick another row`);
    } else if (resolve(name)) problems.push(`${plan.slug}: "${name}" exists already (would be reused)`);
    const n = note(r);
    items.push({
      e: name,
      b: r.block,
      g: r.group_key,
      r: r.rest_seconds,
      na: n?.ar ?? null,
      ne: n?.en ?? null,
      s: r.sets.map((x) => [x.reps, x.reps_max, x.duration_seconds, x.to_failure ? 1 : 0]),
    });
  }
  return items;
}

const seedPlans = plans.map((p) => {
  const c = copy.plans[p.slug];
  if (!c) problems.push(`no copy for plan: ${p.slug}`);
  const sessionByHash = new Map<string, string>();
  const sessions: Record<string, Item[]> = {};
  const sessionOfWorkout = new Map<string, string>();
  for (const [slug, w] of Object.entries(p.workouts)) {
    const items = sessionItems(p, w);
    const h = createHash("md5").update(JSON.stringify(items)).digest("hex");
    if (!sessionByHash.has(h)) {
      const key = `s${sessionByHash.size + 1}`;
      sessionByHash.set(h, key);
      sessions[key] = items;
    }
    sessionOfWorkout.set(slug, sessionByHash.get(h)!);
  }
  const days = p.days.map((d) => {
    if (d.rest) return [copy.rest.ar, copy.rest.en, null] as [string, string, string | null];
    const label = copy.day_titles[d.clean_title];
    if (!label) problems.push(`${p.slug}: no label for day title "${d.clean_title}"`);
    return [label?.ar ?? d.clean_title, label?.en ?? d.clean_title, sessionOfWorkout.get(d.slug!) ?? null] as [string, string, string | null];
  });
  const emptyTraining = p.days.filter((d, i) => !d.rest && !(days[i][2] && sessions[days[i][2]!].length)).length;
  if (emptyTraining) problems.push(`${p.slug}: ${emptyTraining} training day(s) ended up with no exercises`);
  const equipment = p.equipment.length ? p.equipment : p.categories.some((x) => ["body_weight", "at_home"].includes(x)) || /no equipment/i.test(p.title) ? ["body weight"] : [];
  return {
    slug: p.slug,
    source_url: p.source_url,
    name_ar: c?.name_ar ?? null,
    name_en: c?.name_en ?? null,
    description_ar: c?.description_ar ?? null,
    description_en: c?.description_en ?? null,
    level: p.level,
    goal: copy.goal_override[p.slug] ?? p.goal,
    gender_target: p.gender_target,
    categories: p.categories,
    equipment,
    days_per_week: p.days_per_week,
    duration_weeks: p.weeks_found,
    sessions,
    days,
  };
});

// One temp function seeds a whole plan; repeated sessions are stored once per plan and referenced by key.
const HELPER = `create function pg_temp.seed_plan(p uuid, sessions jsonb, days jsonb)
returns void language plpgsql as $f$
declare day_row record; item jsonb; d uuid; i uuid; lo int; hi int; all_max boolean;
begin
  for day_row in select x as day, n from jsonb_array_elements(days) with ordinality as t(x, n) loop
    insert into public.program_days (program_id, day_index, order_index, label_ar, label_en)
    values (p, day_row.n::int, day_row.n::int - 1, day_row.day->>0, day_row.day->>1)
    returning id into d;
    if day_row.day->>2 is not null then
      for item in select x from jsonb_array_elements(sessions->(day_row.day->>2)) with ordinality as t(x, n) order by n loop
        select coalesce(min((s->>0)::int), 0), coalesce(max(coalesce((s->>1)::int, (s->>0)::int)), 0),
               bool_and((s->>3)::int = 1)
          into lo, hi, all_max from jsonb_array_elements(item->'s') s;
        insert into public.program_items (program_day_id, exercise_id, sets, reps, rest_seconds, order_index, block, group_key, group_kind, notes_ar, notes_en)
        values (d,
          (select e.id from public.exercises e where e.coach_id is null and e.archived_at is null and lower(e.name_en) = lower(item->>'e')
             order by (e.name_en = item->>'e') desc, e.created_at, e.id limit 1),
          jsonb_array_length(item->'s'),
          case when all_max then 'Max' when lo = hi then lo::text else lo || '-' || hi end,
          (item->>'r')::int,
          (select count(*) from public.program_items where program_day_id = d)::int,
          item->>'b', item->>'g', case when item->>'g' is null then null else 'superset' end, item->>'na', item->>'ne')
        returning id into i;
        insert into public.program_item_sets (program_item_id, set_index, reps, reps_max, duration_seconds, rest_seconds, set_type, extra)
        select i, t.n::int, (s->>0)::int, (s->>1)::int, (s->>2)::int, (item->>'r')::int,
               case when (s->>3)::int = 1 then 'amrap' else 'working' end,
               case when (s->>3)::int = 1 then '{"to_failure": true}'::jsonb else null end
        from jsonb_array_elements(item->'s') with ordinality as t(s, n);
      end loop;
    end if;
  end loop;
end
$f$;`;

const blocks = seedPlans.map(
  (p) => `-- ${p.slug}
do $$
declare p uuid;
begin
  insert into public.programs (coach_id, client_id, slug, published, kind, source_url, name_ar, name_en, description_ar, description_en, level, goal, gender_target, categories, equipment, days_per_week, duration_weeks)
  values (null, null, ${q(p.slug)}, true, 'plan', ${q(p.source_url)}, ${q(p.name_ar)}, ${q(p.name_en)}, ${q(p.description_ar)}, ${q(p.description_en)},
    ${q(p.level)}, ${q(p.goal)}, ${q(p.gender_target)}, ${arr(p.categories)}, ${arr(p.equipment)}, ${p.days_per_week ?? "null"}, ${p.duration_weeks})
  on conflict (slug) where coach_id is null do update set
    kind = excluded.kind, source_url = excluded.source_url, name_ar = excluded.name_ar, name_en = excluded.name_en,
    description_ar = excluded.description_ar, description_en = excluded.description_en, level = excluded.level, goal = excluded.goal,
    gender_target = excluded.gender_target, categories = excluded.categories, equipment = excluded.equipment,
    days_per_week = excluded.days_per_week, duration_weeks = excluded.duration_weeks
  returning id into p;

  -- days and items are only created once, so a re-run never duplicates them or undoes an admin's edits
  if not exists (select 1 from public.program_days where program_id = p) then
    perform pg_temp.seed_plan(p, ${q(JSON.stringify(p.sessions))}::jsonb,
      ${q(JSON.stringify(p.days))}::jsonb);
  end if;
end $$;`
);

const plansSql = `-- Multi-week platform workout plans (kind = 'plan', coach_id IS NULL, client_id IS NULL), published.
-- A W-week plan is 7*W program_days (rest days are empty days), see 20261121000001.
-- Structure (days, exercises, sets x reps, rest, supersets) follows the plans listed at
-- https://fitnessprogramer.com/workout-plans/ ; names and descriptions are original, with Arabic in
-- Modern Standard Arabic. source_url keeps the attribution.
-- Idempotent: upserts by slug; days/items are created only for a plan that has none.
-- Dropped on purpose (a value could not be read unambiguously): ${dropped.length} exercise row(s), see the seed script report.

${HELPER}

${blocks.join("\n\n")}
`;

writeFileSync("supabase/migrations/20261121000002_seed_fitnessprogramer_plan_exercises.sql", exercisesSql);
writeFileSync("supabase/migrations/20261121000003_seed_platform_plans.sql", plansSql);
writeFileSync("scripts/data/fitnessprogramer-plans-seed-plan.json", JSON.stringify(seedPlans, null, 1));

const items = seedPlans.flatMap((p) => p.days.flatMap((d) => (d[2] ? p.sessions[d[2]] : [])));
console.log(`new exercises: ${newExercises.length}; plans: ${seedPlans.length}; days: ${seedPlans.reduce((n, p) => n + p.days.length, 0)}; items: ${items.length}; sets: ${items.reduce((n, i) => n + i.s.length, 0)}`);
console.log(`unique sessions stored: ${seedPlans.reduce((n, p) => n + Object.keys(p.sessions).length, 0)}`);
console.log("dropped rows:", dropped.length ? "\n  " + dropped.join("\n  ") : "none");
console.log("problems:", problems.length ? "\n  " + [...new Set(problems)].join("\n  ") : "none");
