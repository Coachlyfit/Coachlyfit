// One-off: applies scripts/data/fitnessprogramer-seed-plan.json to the project in
// .env.local with the same semantics as 20261118000003_seed_platform_templates.sql
// (upsert the program by slug; create its day/items/sets only if it has no days yet).
// Exists because that migration is too large to push through the MCP tool; the
// migration file itself is what other environments run. NOT part of the app.
//
//   npx tsx scripts/fitnessprogramer-apply.mts [--dry]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY missing in .env.local");
const dry = process.argv.includes("--dry");
console.log("target:", new URL(url).host, dry ? "(dry run)" : "");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
type Item = {
  exercise: string;
  block: string;
  group_key: string | null;
  rest_seconds: number | null;
  notes_ar: string | null;
  notes_en: string | null;
  sets: [number | null, number | null, number | null][];
};
type Plan = Record<string, unknown> & { slug: string; items: Item[] };
const plan: Plan[] = JSON.parse(readFileSync("scripts/data/fitnessprogramer-seed-plan.json", "utf8"));

// the migration's exercise lookup: exact-case name first, then oldest
// (PostgREST caps a response at 1000 rows, so page through)
const globals: { id: string; name_en: string }[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("exercises")
    .select("id, name_en")
    .is("coach_id", null)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + 999);
  if (error) throw error;
  globals.push(...data);
  if (data.length < 1000) break;
}
console.log("global exercises:", globals.length);
const resolve = (name: string) =>
  (globals.find((g) => g.name_en === name) ?? globals.find((g) => g.name_en.toLowerCase() === name.toLowerCase()))?.id;

// legacy sets/reps snapshot, same rule as ProgramsService.legacySnapshot
const legacy = (sets: Item["sets"]) => {
  const reps = sets.map((s) => s[0]).filter((r): r is number => r != null);
  const tops = sets.map((s) => s[1] ?? s[0]).filter((r): r is number => r != null);
  const lo = reps.length ? Math.min(...reps) : 0;
  const hi = tops.length ? Math.max(...tops) : 0;
  return lo === hi ? String(lo) : `${lo}-${hi}`;
};

let created = 0;
let kept = 0;
for (const { items, ...meta } of plan) {
  const missing = items.filter((i) => !resolve(i.exercise)).map((i) => i.exercise);
  if (missing.length) throw new Error(`${meta.slug}: exercises not found: ${missing.join(", ")}`);
  if (dry) continue;

  // upsert by slug (the unique index is partial, so select-then-write rather than ON CONFLICT)
  const { data: existing, error: eErr } = await db.from("programs").select("id").eq("slug", meta.slug).is("coach_id", null).maybeSingle();
  if (eErr) throw eErr;
  let programId = existing?.id;
  if (programId) {
    const { error } = await db.from("programs").update(meta as never).eq("id", programId);
    if (error) throw error;
  } else {
    const { data, error } = await db.from("programs").insert({ ...meta, coach_id: null, client_id: null, published: true } as never).select("id").single();
    if (error) throw error;
    programId = data.id;
  }

  const { count, error: cErr } = await db.from("program_days").select("id", { count: "exact", head: true }).eq("program_id", programId);
  if (cErr) throw cErr;
  if (count) {
    kept++;
    continue;
  }

  const { data: day, error: dErr } = await db
    .from("program_days")
    .insert({ program_id: programId, day_index: 1, order_index: 0, label_ar: "اليوم 1", label_en: "Day 1" } as never)
    .select("id")
    .single();
  if (dErr) throw dErr;

  const { data: rows, error: iErr } = await db
    .from("program_items")
    .insert(
      items.map((it, ord) => ({
        program_day_id: day.id,
        exercise_id: resolve(it.exercise)!,
        sets: it.sets.length,
        reps: legacy(it.sets),
        rest_seconds: it.rest_seconds,
        order_index: ord,
        block: it.block,
        group_key: it.group_key,
        group_kind: it.group_key ? "superset" : null,
        notes_ar: it.notes_ar,
        notes_en: it.notes_en,
      })) as never
    )
    .select("id, order_index");
  if (iErr) throw iErr;

  const byOrder = new Map(rows.map((r) => [r.order_index, r.id]));
  const { error: sErr } = await db.from("program_item_sets").insert(
    items.flatMap((it, ord) =>
      it.sets.map((s, k) => ({
        program_item_id: byOrder.get(ord)!,
        set_index: k + 1,
        reps: s[0],
        reps_max: s[1],
        duration_seconds: s[2],
        rest_seconds: it.rest_seconds,
      }))
    ) as never
  );
  if (sErr) throw sErr;
  created++;
}
console.log(dry ? `dry run ok: ${plan.length} workouts resolve` : `created ${created}, already had days ${kept}`);
