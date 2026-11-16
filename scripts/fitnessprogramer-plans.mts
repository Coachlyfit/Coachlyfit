// One-off: crawl https://fitnessprogramer.com/workout-plans/ (+ page 2), each plan page, and the
// training-day workout pages it links to; match exercises to our global library; write a
// reviewable JSON. NOT part of the app. Polite by design: one request every 2s, a single pass,
// everything cached on disk (a page already in the cache is never fetched again), a hard cap on
// requests, plain /workout-plan/ and /workout/ URLs only (robots.txt allows them; `?pw=` is never used).
//
//   npx tsx scripts/fitnessprogramer-plans.mts <cacheDir> <globals.json> [out.json]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { type GlobalExercise } from "../src/domain/programs/platform/exercise-match";
import {
  cleanDayTitle,
  genderTarget,
  isRestTitle,
  parseDurationWeeks,
  planGoal,
  planLevel,
  trainingDaysPerWeek,
  uniqueWorkoutSlugs,
  type PlanDay,
} from "../src/domain/programs/platform/scraped-plan";
import { parseWorkoutPage, type ParsedWorkout } from "./fitnessprogramer-parse.mts";

const [cacheDir, globalsPath, outPath = "scripts/data/fitnessprogramer-plans.json"] = process.argv.slice(2);
if (!cacheDir || !globalsPath) throw new Error("usage: fitnessprogramer-plans.mts <cacheDir> <globals.json> [out.json]");
const globals: GlobalExercise[] = JSON.parse(readFileSync(globalsPath, "utf8"));

const BASE = "https://fitnessprogramer.com";
const UA = "Mozilla/5.0 (compatible; one-off-catalog-research; single pass)";
const MAX_FETCHES = 400;
let fetches = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cached(file: string, url: string): Promise<string> {
  const p = `${cacheDir}/${file}`;
  if (existsSync(p)) return readFileSync(p, "utf8");
  if (++fetches > MAX_FETCHES) throw new Error("request cap reached");
  await sleep(2000);
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const html = await res.text();
  writeFileSync(p, html);
  console.log("fetched", url);
  return html;
}

const text = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
const lastSegment = (href: string) => new URL(href, BASE).pathname.split("/").filter(Boolean).pop() ?? "";

// ---- 1. list pages -----------------------------------------------------------
type Card = { slug: string; title: string; goal_raw: string; gender_raw: string; duration_raw: string };
const cards: Card[] = [];
let listUrl: string | null = `${BASE}/workout-plans/`;
for (let page = 1; listUrl && page <= 5; page++) {
  const doc = new JSDOM(await cached(`plans-list-${page}.html`, listUrl)).window.document;
  for (const a of doc.querySelectorAll("article.entry")) {
    const href = a.querySelector<HTMLAnchorElement>(".title a")?.href;
    if (!href || !/\/workout-plan\//.test(href)) continue;
    cards.push({
      slug: lastSegment(href),
      title: text(a.querySelector(".title")),
      goal_raw: text(a.querySelector(".goals")),
      gender_raw: text(a.querySelector(".genders")),
      duration_raw: text(a.querySelector(".durations")),
    });
  }
  const next = doc.querySelector<HTMLAnchorElement>("a.next");
  listUrl = next && next.href !== listUrl ? next.href : null;
}
console.log(`${cards.length} plans on the list pages`);

// ---- 2. plan pages -> weeks/days ------------------------------------------------
type PlanPage = { weeks: number; days: PlanDay[] };
async function parsePlanPage(slug: string): Promise<PlanPage> {
  const doc = new JSDOM(await cached(`plan-${slug}.html`, `${BASE}/workout-plan/${slug}/`)).window.document;
  const weeks = [...doc.querySelectorAll(".wpt_workoutplan_schedule .week")];
  const days: PlanDay[] = [];
  for (const week of weeks) {
    for (const entry of week.querySelectorAll(".week_entries .entry")) {
      const title = text(entry.querySelector(".title"));
      const href = entry.querySelector<HTMLAnchorElement>("a")?.href ?? null;
      // Number by position, not by the site's "Day N" label: some plans' labels restart or skip
      // (6-Month Bodybuilding), while every week block always holds exactly 7 entries.
      const day = days.length + 1;
      const rest = isRestTitle(title);
      days.push({ day, title, slug: rest || !href ? null : lastSegment(href), rest });
    }
  }
  return { weeks: weeks.length, days };
}
const pages = new Map<string, PlanPage>();
for (const c of cards) pages.set(c.slug, await parsePlanPage(c.slug));

// ---- 3. training-day workout pages ------------------------------------------------
const workouts = new Map<string, ParsedWorkout>();
for (const slug of new Set([...pages.values()].flatMap((p) => uniqueWorkoutSlugs(p.days)))) {
  const html = await cached(`workout-${slug}.html`, `${BASE}/workout/${slug}/`);
  workouts.set(slug, parseWorkoutPage(html, slug, globals));
}

// ---- 4. assemble + report -----------------------------------------------------------
const plans = cards.map((c) => {
  const page = pages.get(c.slug)!;
  const slugs = uniqueWorkoutSlugs(page.days);
  const used = slugs.map((s) => workouts.get(s)!);
  const rows = used.flatMap((w) => w.exercises);
  const uniqueEx = new Map(rows.map((r) => [r.site_slug, r]));
  const unmatched = [...uniqueEx.values()].filter((r) => !r.match).map((r) => r.name);
  const unparsed = used.flatMap((w) => w.unparsed.map((u) => `${w.slug}: ${u}`));
  const listed = parseDurationWeeks(c.duration_raw);
  const status = page.days.length === 0 ? "no_schedule" : used.some((w) => w.status === "no_exercises") ? "empty_workouts" : unmatched.length ? "unmatched" : unparsed.length ? "unparsed" : "ok";
  return {
    slug: c.slug,
    source_url: `${BASE}/workout-plan/${c.slug}/`,
    title: c.title,
    goal_raw: c.goal_raw,
    gender_raw: c.gender_raw,
    duration_raw: c.duration_raw,
    duration_listed: listed,
    weeks_found: page.weeks,
    goal: planGoal(c.goal_raw),
    gender_target: genderTarget(c.gender_raw),
    level: planLevel(c.title, used.map((w) => w.levels)),
    days_per_week: trainingDaysPerWeek(page.days, page.weeks),
    categories: [...new Set(used.flatMap((w) => w.categories))],
    equipment: [...new Set(used.flatMap((w) => w.equipment))],
    days: page.days.map((d) => ({ ...d, clean_title: d.rest ? "REST" : cleanDayTitle(d.title) })),
    workouts: Object.fromEntries(used.map((w) => [w.slug, w])),
    exercises_unique: uniqueEx.size,
    exercises_matched: uniqueEx.size - unmatched.length,
    unmatched,
    unparsed,
    status,
  };
});
writeFileSync(outPath, JSON.stringify(plans, null, 2));

const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
console.log(`\n${pad("plan", 46)} ${pad("listed", 6)} ${pad("found", 5)} d/w  workouts  match      status`);
for (const p of plans) {
  console.log(
    `${pad(p.title, 46)} ${pad(String(p.duration_listed ?? "?"), 6)} ${pad(String(p.weeks_found), 5)} ${pad(String(p.days_per_week ?? "?"), 4)} ${pad(String(Object.keys(p.workouts).length), 9)} ${pad(`${p.exercises_matched}/${p.exercises_unique}`, 10)} ${p.status}`
  );
}
const gaps = new Map<string, number>();
for (const p of plans) for (const n of p.unmatched) gaps.set(n, (gaps.get(n) ?? 0) + 1);
console.log(`\nUNMATCHED exercise names across plans: ${gaps.size}`);
for (const [n, c] of [...gaps].sort((a, b) => b[1] - a[1])) console.log(`  ${n} (${c})`);
console.log("\nUNPARSED rows:");
for (const p of plans) for (const u of p.unparsed) console.log(`  ${p.slug} :: ${u}`);
console.log(`\nfetches this run: ${fetches}`);
