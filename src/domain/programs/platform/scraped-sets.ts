/** Parses the free-text sets/reps/rest cells scraped from fitnessprogramer.com
 * into structured set rows. The site's values are hand-typed ("12, 12, 12",
 * "12-12-12", "10-12", "20 Sec", `45-60"`), so anything that doesn't match a
 * known shape returns null plus a flag and is reported for review — never
 * guessed. Used by the one-off seed script. */

/** `to_failure` marks a "Max" set: no rep target, work until you can't (stored as an AMRAP set). */
export type ScrapedSet = {
  reps: number | null;
  reps_max: number | null;
  duration_seconds: number | null;
  to_failure?: boolean;
};
export type ParsedSets = { sets: ScrapedSet[] | null; flags: string[] };

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const nums = (s: string) => s.split(/[^0-9]+/).filter(Boolean).map(Number);
const repeat = (n: number, row: ScrapedSet) => Array.from({ length: n }, () => ({ ...row }));

/** "3" -> 3, "2-3" -> 2 (lower bound, flagged), anything else -> null. */
function parseCount(raw: string, flags: string[]): number | null {
  const m = clean(raw).match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!m) return null;
  if (m[2]) flags.push(`sets_range:${clean(raw)}`);
  return Number(m[1]);
}

export function parseSets(setsRawIn: string | null, repsRaw: string | null): ParsedSets {
  const flags: string[] = [];
  // the sets cell can carry the warm-up label instead ("2-3 warm-up"): same meaning, so strip and remember it
  const SETS_WARMUP = /\s*(warming|warm-?\s*up)$/i;
  const setsWarmup = SETS_WARMUP.test(clean(setsRawIn));
  const setsRaw = setsWarmup ? clean(setsRawIn).replace(SETS_WARMUP, "") : setsRawIn;
  const rawReps = clean(repsRaw).replace(/^[-,.\s]+|[-,.\s]+$/g, "");
  // "10-15 warming" / "8-10 min warm-up": the numbers are normal, the label marks a warm-up block
  const WARMUP = /\s*(warming|warm-?\s*up)$/i;
  const warmup = WARMUP.test(rawReps);
  const reps = warmup ? rawReps.replace(WARMUP, "") : rawReps;
  if (!reps) return { sets: null, flags: ["no_reps"] };
  if (warmup || setsWarmup) flags.push("warmup");

  // "Max": no rep target, to failure
  if (/^max(imum)?$/i.test(reps)) {
    const count = parseCount(setsRaw ?? "", flags);
    if (count == null) return { sets: null, flags: [...flags, `unparsed_sets:${clean(setsRaw)}`] };
    return { sets: repeat(count, { reps: null, reps_max: null, duration_seconds: null, to_failure: true }), flags };
  }

  // Timed: "20 Sec", "10-15 sec", "5 min", "20 sec - Sprint"
  const timed = reps.match(/^(\d+)(?:\s*-\s*(\d+))?\s*(sec(?:ond)?s?|min(?:ute)?s?)(?:\s*-\s*(sprint))?$/i);
  if (timed) {
    const unit = /^min/i.test(timed[3]) ? 60 : 1;
    if (timed[2]) flags.push(`duration_range:${reps}`);
    if (timed[4]) flags.push("sprint");
    const count = parseCount(setsRaw ?? "", flags);
    if (count == null) return { sets: null, flags: [...flags, `unparsed_sets:${clean(setsRaw)}`] };
    return { sets: repeat(count, { reps: null, reps_max: null, duration_seconds: Number(timed[1]) * unit }), flags };
  }

  // Per-set list: "12, 12, 12" / "12,10, 8, 6" / "12-12-12" (3+ dash-separated)
  if (/^\d+(\s*[,.]\s*\d+)+$/.test(reps) || /^\d+(\s*-\s*\d+){2,}$/.test(reps)) {
    const list = nums(reps);
    const declared = parseCount(setsRaw ?? "", []);
    if (declared != null && declared !== list.length) flags.push(`sets_vs_reps:${clean(setsRaw)}/${list.length}`);
    return { sets: list.map((r) => ({ reps: r, reps_max: null, duration_seconds: null })), flags };
  }

  // A typo'd list ("12 12, 12": a space where a comma belongs) is accepted ONLY when it has exactly
  // the declared number of sets and every number is a plausible rep count; otherwise it stays unparsed.
  if (/^\d+([\s,.]+\d+)+$/.test(reps)) {
    const list = nums(reps);
    const declared = parseCount(setsRaw ?? "", []);
    if (declared === list.length && list.every((n) => n >= 1 && n <= 100)) {
      return { sets: list.map((r) => ({ reps: r, reps_max: null, duration_seconds: null })), flags: [...flags, `typo_fixed:${reps}`] };
    }
  }

  const count = parseCount(setsRaw ?? "", flags);
  if (count == null) return { sets: null, flags: [...flags, `unparsed_sets:${clean(setsRaw)}`] };

  // Range: "10-12"
  const range = reps.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    const [lo, hi] = [Number(range[1]), Number(range[2])];
    if (lo > hi) return { sets: null, flags: [...flags, `unparsed_reps:${reps}`] };
    return { sets: repeat(count, { reps: lo, reps_max: lo === hi ? null : hi, duration_seconds: null }), flags };
  }

  // Single number: "12"
  if (/^\d+$/.test(reps)) {
    return { sets: repeat(count, { reps: Number(reps), reps_max: null, duration_seconds: null }), flags };
  }

  return { sets: null, flags: [...flags, `unparsed_reps:${reps}`] };
}

export type ParsedRest = { rest_seconds: number | null; marker: "pair" | "end" | null; flags: string[] };

/** The site puts the superset marker in the Rest cell ("Super Set" on both
 * members of a pair, or "Superset 1" on the pair's second exercise) and the
 * real rest between supersets in the Duration cell ("60-120 Sec"). */
export function parseRest(restRaw: string | null, durationRaw: string | null): ParsedRest {
  const rest = clean(restRaw);
  const seconds = (s: string): number | null => {
    const m = s.match(/^(\d+)(?:\s*-\s*\d+)?\s*(?:"|'')?\s*(?:sec(?:ond)?s?)?$/i);
    return m ? Number(m[1]) : null;
  };
  if (!rest) return { rest_seconds: null, marker: null, flags: [] };
  if (/super\s*set/i.test(rest)) {
    const marker = /super\s*set\s*\d+/i.test(rest) ? "end" : "pair";
    return { rest_seconds: seconds(clean(durationRaw)), marker, flags: [] };
  }
  const s = seconds(rest);
  return s == null
    ? { rest_seconds: null, marker: null, flags: [`unparsed_rest:${rest}`] }
    : { rest_seconds: s, marker: null, flags: [] };
}

export type GroupableRow = { marker: "pair" | "end" | null; rest_seconds: number | null };

/** Assigns superset keys: consecutive "Super Set" rows pair up two at a time;
 * a "Superset N" row groups with the unmarked row right before it. Returns a
 * key (or null) per row, plus a flag for any marker it couldn't place. */
export function groupSupersets(rows: GroupableRow[]): { keys: (string | null)[]; flags: string[] } {
  const keys: (string | null)[] = rows.map(() => null);
  const flags: string[] = [];
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    if (keys[i] != null) continue;
    if (rows[i].marker === "end") {
      if (i > 0 && keys[i - 1] == null && rows[i - 1].marker == null) {
        n++;
        keys[i - 1] = keys[i] = `ss${n}`;
      } else flags.push(`superset_unplaced:${i + 1}`);
    } else if (rows[i].marker === "pair") {
      if (rows[i + 1]?.marker === "pair" && keys[i + 1] == null) {
        n++;
        keys[i] = keys[i + 1] = `ss${n}`;
      } else flags.push(`superset_unplaced:${i + 1}`);
    }
  }
  return { keys, flags };
}
