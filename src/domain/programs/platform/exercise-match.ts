/** Matches an exercise name scraped from fitnessprogramer.com to a row of our
 * global library. Used by the one-off seed script; kept in src/ so it is
 * unit-tested with the rest of the domain. */

export type GlobalExercise = { id: string; name_en: string; video_url: string | null };
export type MatchSource = { name: string; gif?: string | null };
export type Match = { id: string; name_en: string; via: "gif" | "name" | "equivalent" };

/** Plural -> singular for one lowercase token. Deliberately naive: it only has
 * to map the same word to the same key on both sides of the comparison. */
function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (/(ch|sh|x|z|ss)es$/.test(w)) return w.slice(0, -2);
  if (/(ss|us|is)$/.test(w)) return w;
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/** lowercase, drop "(male)"/"(female)" and "v. 2" / "v2" / "version 2", strip
 * punctuation, singularize, then sort the tokens so word order is ignored. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\((male|female)\)/g, " ")
    .replace(/\b(v|ver|version)\.?\s*\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(singular)
    .sort()
    .join(" ");
}

/** File name of a gif URL without query or extension: ".../2021/02/plank.gif?x" -> "plank". */
export function gifKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const file = url.split("?")[0].split("/").pop() ?? "";
  const key = file.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
  return key || null;
}

/** Words that say which equipment a variant uses. "lever"/"leverage" is how
 * our library spells what the site calls "machine". */
const EQUIPMENT_WORDS = new Set([
  "barbell", "dumbbell", "cable", "machine", "lever", "leverage", "smith", "band", "weighted", "bodyweight", "rope", "ez",
]);
/** Filler that never changes the movement. */
const FILLER = new Set(["attachment", "bar", "the", "with", "on", "pose"]);
const canonEquip = (w: string) => (w === "lever" || w === "leverage" ? "machine" : w);

const words = (s: string) => normalizeName(s).split(" ").filter(Boolean);

/** Name with decoration removed. A source name's parentheticals are always
 * decoration; a library name's only when they add no new word ("(Machine Fly)"
 * on "Pec Deck Fly" is a synonym, "(wall)" is a different exercise). */
function stripParens(name: string, always: boolean): string {
  const outside = name.replace(/\([^)]*\)/g, " ");
  if (always) return outside;
  const known = new Set([...words(outside), ...EQUIPMENT_WORDS, ...FILLER]);
  return name.replace(/\(([^)]*)\)/g, (all, inner: string) => (words(inner).every((w) => known.has(w)) ? " " : all));
}

/** Movement key: normalized words minus equipment and filler. Null if empty. */
function looseKey(name: string, always: boolean): string | null {
  const w = words(stripParens(name, always)).filter((x) => !EQUIPMENT_WORDS.has(x) && !FILLER.has(x));
  return w.length > 0 ? w.join(" ") : null;
}

/** Third tier: an existing exercise that is the same movement under a more
 * specific name ("Romanian Deadlift" -> "barbell romanian deadlift"). Every
 * equipment word on the library side must also appear on the site side (its
 * name or equipment list), so a bodyweight "Glute Bridge" never maps to the
 * barbell one. If two different movements are still left it returns null
 * rather than picking one. */
export function matchEquivalent(src: MatchSource & { equipment?: string[] }, globals: GlobalExercise[]): Match | null {
  const key = looseKey(src.name, true);
  if (!key) return null;
  const have = new Set(
    [...words(src.name), ...(src.equipment ?? []).flatMap(words)].filter((w) => EQUIPMENT_WORDS.has(w)).map(canonEquip)
  );
  const pool = globals.filter(
    (g) =>
      looseKey(g.name_en, false) === key &&
      words(g.name_en).filter((w) => EQUIPMENT_WORDS.has(w)).every((w) => have.has(canonEquip(w)))
  );
  if (new Set(pool.map((g) => normalizeName(g.name_en))).size !== 1) return null;
  // "x" and "x v. 2" normalize equal: take the plainer name
  const hit = [...pool].sort((a, b) => a.name_en.length - b.name_en.length)[0];
  return { id: hit.id, name_en: hit.name_en, via: "equivalent" };
}

export function matchExercise(src: MatchSource, globals: GlobalExercise[]): Match | null {
  // The site's gif is the strongest key: our seed copied those same URLs.
  const gif = gifKey(src.gif);
  if (gif) {
    const hit = globals.find((g) => gifKey(g.video_url) === gif);
    if (hit) return { id: hit.id, name_en: hit.name_en, via: "gif" };
  }
  const key = normalizeName(src.name);
  if (!key) return null;
  const hit = globals.find((g) => normalizeName(g.name_en) === key);
  return hit ? { id: hit.id, name_en: hit.name_en, via: "name" } : null;
}
