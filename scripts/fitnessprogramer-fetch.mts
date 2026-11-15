// One-off crawler helper for the platform template library seed. NOT part of
// the app. Polite by design: one request every 2s, a single pass, and every
// page is cached on disk so re-running (or re-parsing) never hits the site again.
//
//   npx tsx scripts/fitnessprogramer-fetch.mts <cacheDir>
//
// Writes <cacheDir>/list-<n>.html and <cacheDir>/workout-<slug>.html.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const BASE = "https://fitnessprogramer.com";
const DELAY_MS = 2000;
const UA = "Mozilla/5.0 (compatible; one-off-catalog-research; single pass)";

const cacheDir = process.argv[2];
if (!cacheDir) throw new Error("usage: fitnessprogramer-fetch.mts <cacheDir>");
mkdirSync(cacheDir, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cached(file: string, url: string): Promise<string> {
  const p = path.join(cacheDir, file);
  if (existsSync(p)) return readFileSync(p, "utf8");
  await sleep(DELAY_MS);
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const html = await res.text();
  writeFileSync(p, html);
  console.log("fetched", url);
  return html;
}

const workoutUrls: string[] = [];
let next: string | null = `${BASE}/workouts/`;
let page = 1;
while (next) {
  const html = await cached(`list-${page}.html`, next);
  const doc = new JSDOM(html).window.document;
  for (const a of doc.querySelectorAll<HTMLAnchorElement>("a[href*='/workout/']")) {
    const href = a.href.split("#")[0];
    if (/\/workout\/[^/]+\/?$/.test(href) && !workoutUrls.includes(href)) workoutUrls.push(href);
  }
  const nextLink = doc.querySelector<HTMLAnchorElement>("a.next, a[rel='next']");
  next = nextLink && nextLink.href !== next ? nextLink.href : null;
  page++;
  if (page > 10) throw new Error("pagination runaway");
}
console.log(`${workoutUrls.length} workouts found`);
writeFileSync(path.join(cacheDir, "workout-urls.json"), JSON.stringify(workoutUrls, null, 2));

for (const url of workoutUrls) {
  const slug = url.replace(/\/$/, "").split("/").pop()!;
  await cached(`workout-${slug}.html`, url);
}
console.log("done");
