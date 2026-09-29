// Maps this app's free-text muscle names (exercises.primary_muscles /
// secondary_muscles, seeded from fitnessprogramer — see
// 20260923000001_seed_fitnessprogramer_exercises.sql — and never DB
// constrained) onto the body-muscles package's fixed region IDs, so a
// BodyChart (src/components/body-map/body-map.tsx) can render them.
//
// body-muscles IDs come in two shapes: most are `{base}-left`/`{base}-right`
// (SIDED_BASES lists the `{base}` half), a few are singular with no side
// (SINGULAR_REGIONS). This file only deals in bases/singulars — the side
// suffixes are added by `expandRegion`, so every entry below lights up both
// sides at once (this app has no left/right muscle data to target one side).

/** `{base}-left`/`{base}-right` pairs the installed body-muscles@1.0.0
 * build exposes (verified against its dist bundle — the package has no
 * runtime-exported ID list to import). Keep in sync if the package updates.
 * Only used at the type level (RegionBase below) — every entry that matters
 * at runtime goes through MUSCLE_TO_REGIONS / MUSCLE_GROUP_FALLBACK, which
 * TypeScript already checks against this list. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- type-only use, see comment above
const SIDED_BASES = [
  "abs-lower",
  "abs-upper",
  "adductors",
  "biceps",
  "calves-gastroc-lateral",
  "calves-gastroc-medial",
  "calves-soleus",
  "chest-lower",
  "chest-upper",
  "deltoid-rear",
  "elbow",
  "foot-back",
  "foot",
  "forearm-extensors",
  "forearm-flexors",
  "forearm",
  "gluteus-maximus",
  "gluteus-medius",
  "hamstrings-lateral",
  "hamstrings-medial",
  "hand-back",
  "hand",
  "hip-flexor",
  "knee-back",
  "knee",
  "lats-lower",
  "lats-mid",
  "lats-upper",
  "lower-back-erectors",
  "lower-back-ql",
  "neck",
  "obliques",
  "quads",
  "serratus-anterior",
  "shoulder-front",
  "shoulder-side",
  "tibialis-anterior",
  "traps-lower",
  "traps-mid",
  "traps-upper",
  "triceps-lateral",
  "triceps-long",
] as const;

/** Singular region IDs with no left/right split. */
const SINGULAR_REGIONS = ["spine", "head", "head-back", "face", "nape"] as const;

type RegionBase = (typeof SIDED_BASES)[number] | (typeof SINGULAR_REGIONS)[number];

const SINGULAR_SET = new Set<string>(SINGULAR_REGIONS);

/** `base` -> its concrete body-muscles region ID(s). */
function expandRegion(base: RegionBase): string[] {
  return SINGULAR_SET.has(base) ? [base] : [`${base}-left`, `${base}-right`];
}

/** Seed muscle name (lowercased, trimmed) -> body-muscles region bases.
 * Anatomically approximate where the package has no matching region (e.g.
 * rotator-cuff muscles, peroneals, spinal muscles all fall back to the
 * nearest region body-muscles actually draws) — good enough for an at-a-
 * glance "what does this train" map, not a clinical reference. */
const MUSCLE_TO_REGIONS: Record<string, RegionBase[]> = {
  trapezius: ["traps-upper", "traps-mid", "traps-lower"],
  "trapezius upper": ["traps-upper"],
  "trapezius middle": ["traps-mid"],
  "trapezius lower": ["traps-lower"],
  neck: ["neck"],
  "neck extensors": ["neck"],
  "stabilizing neck muscles": ["neck"],
  "levator scapulae": ["neck"],
  "erector spinae": ["lower-back-erectors"],
  "anterior deltoid": ["shoulder-front"],
  "posterior deltoid": ["deltoid-rear"],
  "lateral deltoid": ["shoulder-side"],
  deltoid: ["shoulder-front", "shoulder-side", "deltoid-rear"],
  deltoids: ["shoulder-front", "shoulder-side", "deltoid-rear"],
  shoulders: ["shoulder-front", "shoulder-side"],
  shoulder: ["shoulder-front", "shoulder-side"],
  rhomboids: ["traps-mid"],
  brachioradialis: ["forearm-extensors"],
  brachialis: ["biceps"],
  "teres minor": ["shoulder-side"],
  "teres major": ["lats-upper"],
  infraspinatus: ["shoulder-side"],
  supraspinatus: ["shoulder-side"],
  "rotator cuff": ["shoulder-side"],
  "serratus anterior": ["serratus-anterior"],
  sternocleidomastoid: ["neck"],
  quadriceps: ["quads"],
  quads: ["quads"],
  hamstrings: ["hamstrings-medial", "hamstrings-lateral"],
  triceps: ["triceps-long", "triceps-lateral"],
  "triceps brachii": ["triceps-long", "triceps-lateral"],
  "triceps long head": ["triceps-long"],
  biceps: ["biceps"],
  "biceps brachii": ["biceps"],
  "biceps short head": ["biceps"],
  "rectus abdominis": ["abs-upper", "abs-lower"],
  abs: ["abs-upper", "abs-lower"],
  abdominals: ["abs-upper", "abs-lower"],
  "transverse abdominis": ["abs-lower"],
  obliques: ["obliques"],
  "latissimus dorsi": ["lats-upper", "lats-mid", "lats-lower"],
  lats: ["lats-upper", "lats-mid", "lats-lower"],
  back: ["lats-upper", "lats-mid", "lats-lower", "traps-mid", "lower-back-erectors"],
  "upper back": ["traps-upper", "traps-mid", "lats-upper"],
  "lower back": ["lower-back-erectors", "lower-back-ql"],
  "quadratus lumborum": ["lower-back-ql"],
  glutes: ["gluteus-maximus", "gluteus-medius"],
  "gluteus maximus": ["gluteus-maximus"],
  "gluteus medius": ["gluteus-medius"],
  "gluteus minimus": ["gluteus-medius"],
  "hip external rotators": ["gluteus-medius"],
  "pectoralis major": ["chest-upper", "chest-lower"],
  pectoralis: ["chest-upper", "chest-lower"],
  chest: ["chest-upper", "chest-lower"],
  "pectoralis major clavicular": ["chest-upper"],
  "pectoralis major sternal": ["chest-lower"],
  "pectoralis minor": ["chest-upper"],
  intercostals: ["chest-lower"],
  soleus: ["calves-soleus"],
  gastrocnemius: ["calves-gastroc-lateral", "calves-gastroc-medial"],
  calves: ["calves-gastroc-lateral", "calves-gastroc-medial", "calves-soleus"],
  plantaris: ["calves-gastroc-medial"],
  "tibialis anterior": ["tibialis-anterior"],
  "tibialis posterior": ["calves-soleus"],
  "peroneus longus": ["calves-gastroc-lateral"],
  "peroneus brevis": ["calves-gastroc-lateral"],
  peroneals: ["calves-gastroc-lateral"],
  "flexor hallucis longus": ["calves-soleus"],
  "flexor digitorum longus": ["calves-soleus"],
  "adductor magnus": ["adductors"],
  "adductor longus": ["adductors"],
  "adductor brevis": ["adductors"],
  adductors: ["adductors"],
  pectineus: ["adductors"],
  sartorius: ["quads"],
  "tensor fasciae latae": ["hip-flexor"],
  "hip flexors": ["hip-flexor"],
  hip: ["hip-flexor"],
  iliopsoas: ["hip-flexor"],
  psoas: ["hip-flexor"],
  forearm: ["forearm-flexors", "forearm-extensors"],
  forearms: ["forearm-flexors", "forearm-extensors"],
  "wrist flexors": ["forearm-flexors"],
  legs: ["quads", "hamstrings-medial", "hamstrings-lateral", "calves-gastroc-lateral", "calves-gastroc-medial"],
  "splenius capitis": ["neck"],
  "splenius cervicis": ["neck"],
  splenius: ["neck"],
  "semispinalis capitis": ["neck"],
  "semispinalis cervicis": ["neck"],
  "spinalis capitis": ["neck"],
  "spinalis cervicis": ["neck"],
  "longissimus capitis": ["neck"],
  "longissimus cervicis": ["neck"],
  "longus capitis": ["neck"],
  "longus colli": ["neck"],
  "rectus capitis": ["neck"],
  scalene: ["neck"],
  scalenes: ["neck"],
  "scalene anterior": ["neck"],
  "anterior scalene": ["neck"],
  "middle scalene": ["neck"],
  omohyoid: ["neck"],
  sternothyroid: ["neck"],
  platysma: ["neck"],
};

/** Coarse fallback keyed by the DB-constrained `muscle_group` bucket
 * (taxonomy.ts), used only when an exercise has no detailed
 * primary_muscles/secondary_muscles (pre-20260831 rows). */
const MUSCLE_GROUP_FALLBACK: Record<string, RegionBase[]> = {
  chest: ["chest-upper", "chest-lower"],
  back: ["lats-upper", "lats-mid", "lats-lower", "traps-mid", "lower-back-erectors"],
  legs: ["quads", "hamstrings-medial", "hamstrings-lateral", "calves-gastroc-lateral", "calves-gastroc-medial"],
  shoulders: ["shoulder-front", "shoulder-side", "deltoid-rear"],
  arms: ["biceps", "triceps-long", "triceps-lateral", "forearm-flexors", "forearm-extensors"],
  core: ["abs-upper", "abs-lower", "obliques"],
  glutes: ["gluteus-maximus", "gluteus-medius"],
  cardio: [],
  full_body: ["chest-upper", "lats-mid", "quads", "shoulder-front", "abs-upper"],
  other: [],
};

/** body-muscles region ID -> 0-10 intensity, sparse (only hit regions). */
export type MuscleRegionState = Record<string, number>;

function applyRegions(state: MuscleRegionState, bases: RegionBase[], intensity: number) {
  for (const base of bases) {
    for (const region of expandRegion(base)) {
      state[region] = Math.max(state[region] ?? 0, intensity);
    }
  }
}

/** Region bases for one free-text muscle name, or undefined if unmapped
 * (unmapped names — e.g. "cardio", "full body" as a muscle entry — are
 * dropped rather than guessed at). */
function regionsForMuscleName(name: string): RegionBase[] | undefined {
  return MUSCLE_TO_REGIONS[name.trim().toLowerCase()];
}

/** Turns one exercise's muscle lists into a body-muscles state: primary at
 * intensity 10, secondary at 5 (max-merged, so a muscle that's primary in
 * one entry stays at 10 even if it's also someone's secondary). Falls back
 * to the coarse `muscle_group` bucket at intensity 6 when neither list maps
 * to anything (empty arrays, or only unmapped/free-text names). */
export function exerciseToBodyState(
  primaryMuscles: readonly string[] | null | undefined,
  secondaryMuscles: readonly string[] | null | undefined,
  muscleGroup?: string | null
): MuscleRegionState {
  const state: MuscleRegionState = {};

  for (const name of primaryMuscles ?? []) {
    const bases = regionsForMuscleName(name);
    if (bases) applyRegions(state, bases, 10);
    else if (process.env.NODE_ENV !== "production") {
      console.warn(`[muscle-regions] no body-muscles mapping for primary muscle "${name}"`);
    }
  }
  for (const name of secondaryMuscles ?? []) {
    const bases = regionsForMuscleName(name);
    if (bases) applyRegions(state, bases, 5);
    else if (process.env.NODE_ENV !== "production") {
      console.warn(`[muscle-regions] no body-muscles mapping for secondary muscle "${name}"`);
    }
  }

  if (Object.keys(state).length === 0 && muscleGroup) {
    const fallback = MUSCLE_GROUP_FALLBACK[muscleGroup];
    if (fallback) applyRegions(state, fallback, 6);
  }

  return state;
}

/** Weighted per-region set counts across many exercises (e.g. a program's
 * exercises for the week) — primary muscles count as a full set, secondary
 * as half, matching how programs actually distribute training stress.
 * Merge is additive here (unlike exerciseToBodyState's max), since this is
 * volume across many exercises, not one exercise's own muscle emphasis. */
export function accumulateMuscleVolume(
  entries: readonly {
    primaryMuscles: readonly string[] | null | undefined;
    secondaryMuscles: readonly string[] | null | undefined;
    muscleGroup?: string | null;
    sets: number;
  }[]
): Record<string, number> {
  const totals: Record<string, number> = {};

  const add = (bases: RegionBase[], weight: number) => {
    for (const base of bases) {
      for (const region of expandRegion(base)) {
        totals[region] = (totals[region] ?? 0) + weight;
      }
    }
  };

  for (const entry of entries) {
    if (entry.sets <= 0) continue;
    const primaryBases = (entry.primaryMuscles ?? []).flatMap((name) => regionsForMuscleName(name) ?? []);
    const secondaryBases = (entry.secondaryMuscles ?? []).flatMap((name) => regionsForMuscleName(name) ?? []);

    if (primaryBases.length === 0 && secondaryBases.length === 0 && entry.muscleGroup) {
      const fallback = MUSCLE_GROUP_FALLBACK[entry.muscleGroup];
      if (fallback) add(fallback, entry.sets);
      continue;
    }
    add(primaryBases, entry.sets);
    add(secondaryBases, entry.sets * 0.5);
  }

  return totals;
}

/** Rescales a raw {region: sets} map to 0-10 intensity, busiest region at
 * 10, for feeding straight into a BodyChart's bodyState. Empty input stays
 * empty rather than dividing by zero. */
export function normalizeVolumeToIntensity(totals: Record<string, number>): MuscleRegionState {
  const max = Math.max(0, ...Object.values(totals));
  if (max === 0) return {};

  const state: MuscleRegionState = {};
  for (const [region, sets] of Object.entries(totals)) {
    state[region] = Math.round((sets / max) * 10);
  }
  return state;
}
