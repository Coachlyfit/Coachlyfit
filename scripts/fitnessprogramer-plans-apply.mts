// One-off: applies scripts/data/fitnessprogramer-plans-seed-plan.json to the project in .env.local
// with the same semantics as 20261121000003_seed_platform_plans.sql (upsert the plan by slug; create
// its days/items/sets only if it has no days yet). Exists because that migration is too large to push
// through the MCP tool; the migration file is what other environments run. NOT part of the app.
//
//   npx tsx scripts/fitnessprogramer-plans-apply.mts [--dry]
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
  e: string;
  b: string;
  g: string | null;
  r: number | null;
  na: string | null;
  ne: string | null;
  s: [number | null, number | null, number | null, 0 | 1][];
};
type Plan = Record<string, unknown> & {
  slug: string;
  sessions: Record<string, Item[]>;
  days: [string, string, string | null][];
};
const plans: Plan[] = JSON.parse(readFileSync("scripts/data/fitnessprogramer-plans-seed-plan.json", "utf8"));

// the migration's exercise lookup: exact-case name first, then oldest (PostgREST caps a response at 1000 rows)
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

const legacyReps = (sets: Item["s"]) => {
  if (sets.every((s) => s[3] === 1)) return "Max";
  const reps = sets.map((s) => s[0]).filter((r): r is number => r != null);
  const tops = sets.map((s) => s[1] ?? s[0]).filter((r): r is number => r != null);
  const lo = reps.length ? Math.min(...reps) : 0;
  const hi = tops.length ? Math.max(...tops) : 0;
  return lo === hi ? String(lo) : `${lo}-${hi}`;
};
const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

let created = 0;
let kept = 0;
for (const { sessions, days, ...meta } of plans) {
  const missing = [...new Set(Object.values(sessions).flatMap((s) => s.map((i) => i.e)))].filter((n) => !resolve(n));
  if (missing.length) throw new Error(`${meta.slug}: exercises not found: ${missing.join(", ")}`);
  if (dry) continue;

  const { data: existing, error: eErr } = await db.from("programs").select("id").eq("slug", meta.slug).is("coach_id", null).maybeSingle();
  if (eErr) throw eErr;
  let programId = existing?.id;
  if (programId) {
    const { error } = await db.from("programs").update({ ...meta, kind: "plan" } as never).eq("id", programId);
    if (error) throw error;
  } else {
    const { data, error } = await db
      .from("programs")
      .insert({ ...meta, kind: "plan", coach_id: null, client_id: null, published: true } as never)
      .select("id")
      .single();
    if (error) throw error;
    programId = data.id;
  }

  const { count, error: cErr } = await db.from("program_days").select("id", { count: "exact", head: true }).eq("program_id", programId);
  if (cErr) throw cErr;
  if (count) {
    kept++;
    continue;
  }

  const { data: dayRows, error: dErr } = await db
    .from("program_days")
    .insert(days.map((d, i) => ({ program_id: programId, day_index: i + 1, order_index: i, label_ar: d[0], label_en: d[1] })) as never)
    .select("id, day_index");
  if (dErr) throw dErr;
  const dayId = new Map(dayRows.map((r) => [r.day_index, r.id]));

  // items for every training day, then their sets
  const itemRows: { program_day_id: string; order_index: number; item: Item }[] = [];
  days.forEach((d, i) => {
    if (!d[2]) return;
    sessions[d[2]].forEach((item, ord) => itemRows.push({ program_day_id: dayId.get(i + 1)!, order_index: ord, item }));
  });
  const itemId = new Map<string, string>();
  for (const part of chunks(itemRows, 400)) {
    const { data, error } = await db
      .from("program_items")
      .insert(
        part.map((r) => ({
          program_day_id: r.program_day_id,
          exercise_id: resolve(r.item.e)!,
          sets: r.item.s.length,
          reps: legacyReps(r.item.s),
          rest_seconds: r.item.r,
          order_index: r.order_index,
          block: r.item.b,
          group_key: r.item.g,
          group_kind: r.item.g ? "superset" : null,
          notes_ar: r.item.na,
          notes_en: r.item.ne,
        })) as never
      )
      .select("id, program_day_id, order_index");
    if (error) throw error;
    for (const row of data) itemId.set(`${row.program_day_id}:${row.order_index}`, row.id);
  }
  const setRows = itemRows.flatMap((r) =>
    r.item.s.map((s, k) => ({
      program_item_id: itemId.get(`${r.program_day_id}:${r.order_index}`)!,
      set_index: k + 1,
      reps: s[0],
      reps_max: s[1],
      duration_seconds: s[2],
      rest_seconds: r.item.r,
      set_type: s[3] === 1 ? "amrap" : "working",
      extra: s[3] === 1 ? { to_failure: true } : null,
    }))
  );
  for (const part of chunks(setRows, 1000)) {
    const { error } = await db.from("program_item_sets").insert(part as never);
    if (error) throw error;
  }
  created++;
  console.log(`seeded ${meta.slug}: ${days.length} days, ${itemRows.length} items, ${setRows.length} sets`);
}
console.log(dry ? `dry run ok: ${plans.length} plans resolve` : `created ${created}, already had days ${kept}`);
