// One-off: parse the cached fitnessprogramer.com workout pages (see
// fitnessprogramer-fetch.mts), match their exercises to our global library, and
// write a reviewable JSON file. NOT part of the app; makes no network requests.
//
//   npx tsx scripts/fitnessprogramer-workouts.mts <cacheDir> <globals.json> [out.json]
//
// globals.json: [{ id, name_en, video_url }] — the coach_id IS NULL exercises.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { normalizeName, type GlobalExercise } from "../src/domain/programs/platform/exercise-match";
import { parseWorkoutPage, unmappedCategories, unmappedEquipment } from "./fitnessprogramer-parse.mts";

const [cacheDir, globalsPath, outPath = "scripts/data/fitnessprogramer-workouts.json"] = process.argv.slice(2);
if (!cacheDir || !globalsPath) throw new Error("usage: fitnessprogramer-workouts.mts <cacheDir> <globals.json> [out.json]");
const globals: GlobalExercise[] = JSON.parse(readFileSync(globalsPath, "utf8"));

// The cache also holds the workouts that plans link to; only the single workouts listed on
// /workouts/ (workout-urls.json, written by fitnessprogramer-fetch.mts) belong in this file.
const listed = new Set(
  (JSON.parse(readFileSync(`${cacheDir}/workout-urls.json`, "utf8")) as string[]).map((u) => u.replace(/\/$/, "").split("/").pop())
);
const workouts = readdirSync(cacheDir)
  .filter((f) => /^workout-.*\.html$/.test(f))
  .filter((f) => listed.has(f.replace(/^workout-/, "").replace(/\.html$/, "")))
  .sort()
  .map((file) => {
    const slug = file.replace(/^workout-/, "").replace(/\.html$/, "");
    return parseWorkoutPage(readFileSync(`${cacheDir}/${file}`, "utf8"), slug, globals);
  });

writeFileSync(outPath, JSON.stringify(workouts, null, 2));

// ---- report -------------------------------------------------------------
const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
console.log(pad("workout", 44), pad("level", 13), "match   status");
for (const w of workouts) {
  const m = w.exercises.filter((r) => r.match).length;
  console.log(pad(w.title, 44), pad(w.level ?? "?", 13), `${m}/${w.exercises.length}`.padEnd(7), w.status);
}
const all = workouts.flatMap((w) => w.exercises);
const byGif = all.filter((r) => r.match?.via === "gif").length;
const byName = all.filter((r) => r.match?.via === "name").length;
const byEquiv = all.filter((r) => r.match?.via === "equivalent").length;
console.log(`\n${workouts.length} workouts, ${all.length} exercise rows: ${byGif} by gif, ${byName} by name, ${byEquiv} by equivalent, ${all.length - byGif - byName - byEquiv} unmatched`);
for (const s of ["ok", "unmatched", "unparsed", "no_exercises"]) console.log(`  ${s}: ${workouts.filter((w) => w.status === s).length}`);
console.log("\nUNMATCHED exercise names (count of workouts):");
const gaps = new Map<string, number>();
for (const w of workouts) for (const n of w.unmatched) gaps.set(n, (gaps.get(n) ?? 0) + 1);
for (const [n, c] of [...gaps].sort((a, b) => b[1] - a[1])) console.log(`  ${n} (${c})`);
// Near-misses for review only — never auto-accepted. A candidate is a global
// whose normalized words contain (or are contained in) the source's, or whose
// gif file name contains the site's.
console.log("\nNEAR-MISS SUGGESTIONS (review; not applied):");
const toks = (s: string) => new Set(normalizeName(s).split(" "));
for (const [n] of [...gaps].sort((a, b) => b[1] - a[1])) {
  const row = all.find((r) => r.name === n)!;
  const src = toks(n);
  const gifKey = (row.gif ?? "").split("/").pop()?.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
  const cands = globals
    .map((g) => {
      const t = toks(g.name_en);
      const inter = [...src].filter((x) => t.has(x)).length;
      const sub = inter === src.size || inter === t.size;
      const gifHit = !!gifKey && !!g.video_url && g.video_url.toLowerCase().includes(gifKey);
      return { g, score: inter / (src.size + t.size - inter), ok: (sub && inter >= 1) || gifHit };
    })
    .filter((c) => c.ok)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((c) => c.g.name_en);
  console.log(`  ${n}  ->  ${cands.length ? cands.join(" | ") : "(none)"}`);
}

console.log("\nUNPARSED rows:");
for (const w of workouts) for (const u of w.unparsed) console.log(`  ${w.slug}: ${u}`);
console.log("\nunmapped categories:", [...unmappedCategories], " unmapped equipment:", [...unmappedEquipment]);
console.log("days_per_week known:", workouts.filter((w) => w.days_per_week).length, "of", workouts.length);
