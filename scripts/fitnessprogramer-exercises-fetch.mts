// One-off, same politeness as fitnessprogramer-fetch.mts: one request every 2s,
// single pass, cached on disk. Fetches the plain /exercise/<slug>/ pages (never
// the ?pw= variants robots.txt disallows) for the slugs in a JSON array.
//
//   npx tsx scripts/fitnessprogramer-exercises-fetch.mts <cacheDir> <slugs.json>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [cacheDir, slugsPath] = process.argv.slice(2);
if (!cacheDir || !slugsPath) throw new Error("usage: fitnessprogramer-exercises-fetch.mts <cacheDir> <slugs.json>");
const slugs: string[] = JSON.parse(readFileSync(slugsPath, "utf8"));
const UA = "Mozilla/5.0 (compatible; one-off-catalog-research; single pass)";

for (const slug of slugs) {
  const file = path.join(cacheDir, `exercise-${slug}.html`);
  if (existsSync(file)) continue;
  await new Promise((r) => setTimeout(r, 2000));
  const url = `https://fitnessprogramer.com/exercise/${slug}/`;
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!res.ok) {
    console.log("FAILED", res.status, url);
    continue;
  }
  writeFileSync(file, await res.text());
  console.log("fetched", url);
}
console.log("done");
