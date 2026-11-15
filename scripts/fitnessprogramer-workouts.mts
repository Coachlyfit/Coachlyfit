// One-off: parse the cached fitnessprogramer.com workout pages (see
// fitnessprogramer-fetch.mts), match their exercises to our global library, and
// write a reviewable JSON file. NOT part of the app; makes no network requests.
//
//   npx tsx scripts/fitnessprogramer-workouts.mts <cacheDir> <globals.json> [out.json]
//
// globals.json: [{ id, name_en, video_url }] — the coach_id IS NULL exercises.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { matchEquivalent, matchExercise, normalizeName, type GlobalExercise, type Match } from "../src/domain/programs/platform/exercise-match";
import { groupSupersets, parseRest, parseSets, type ScrapedSet } from "../src/domain/programs/platform/scraped-sets";

const [cacheDir, globalsPath, outPath = "scripts/data/fitnessprogramer-workouts.json"] = process.argv.slice(2);
if (!cacheDir || !globalsPath) throw new Error("usage: fitnessprogramer-workouts.mts <cacheDir> <globals.json> [out.json]");
const globals: GlobalExercise[] = JSON.parse(readFileSync(globalsPath, "utf8"));

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
const LEVEL_ORDER = ["beginner", "intermediate", "advanced"];

const text = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
const spec = (a: Element, c: string) => {
  const t = text(a.querySelector(`.spec.${c} span`));
  return t || null;
};

type Row = {
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

const unmappedCategories = new Set<string>();
const unmappedEquipment = new Set<string>();
const workouts = [];

for (const file of readdirSync(cacheDir).filter((f) => /^workout-.*\.html$/.test(f)).sort()) {
  const slug = file.replace(/^workout-/, "").replace(/\.html$/, "");
  const doc = new JSDOM(readFileSync(`${cacheDir}/${file}`, "utf8")).window.document;
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
  workouts.push({
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
  });
}

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
console.log(`\n${workouts.length} workouts, ${all.length} exercise rows: ${byGif} by gif, ${byName} by name, ${all.length - byGif - byName} unmatched`);
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
