import type { GroupConfig, GroupKind } from "../group-config";
import type { PlanGoal, PlanLevel, PlanType } from "../plan-meta";
import type { SetInput } from "../programs.service";

/** Ready-made program templates, one per plan type. Pure data: the coach picks
 * one, and createFromStarter (starters.service.ts) turns it into an ordinary
 * template program they can edit and assign. Exercises are referenced by the
 * global library's `name_en` (case-insensitive); a name the library does not
 * have is skipped at creation time rather than failing the whole plan. */

export type StarterBlock = "warmup" | "main" | "accessory" | "finisher" | "cooldown" | "mobility";

export type StarterItem = {
  /** Global exercise name_en. */
  ex: string;
  sets: SetInput[];
  block?: StarterBlock;
  /** Key into the day's `groups`; items sharing it must be consecutive. */
  group?: string;
  notes_en?: string;
  notes_ar?: string;
};

export type StarterDay = {
  label_en: string;
  label_ar: string;
  /** Format of each group used by this day's items (superset, AMRAP, ...). */
  groups?: Record<string, { kind: GroupKind; config?: GroupConfig }>;
  items: StarterItem[];
};

export type Starter = {
  id: string;
  plan_type: PlanType;
  goal: PlanGoal;
  level: PlanLevel;
  equipment: string[];
  name_en: string;
  name_ar: string;
  days: StarterDay[];
};

// ---- set builders -------------------------------------------------------
const sets = (n: number, set: SetInput): SetInput[] => Array.from({ length: n }, () => ({ ...set }));
/** n sets of `r` reps (weight left for the coach to prescribe per client). */
const reps = (n: number, r: number, rest = 90, weight?: number) => sets(n, { reps: r, weight: weight ?? null, rest_seconds: rest });
/** n sets of a rep range ("8-10") at a target RPE. */
const range = (n: number, lo: number, hi: number, rest = 90, rpe?: number): SetInput[] =>
  sets(n, { reps: lo, reps_max: hi, rpe_target: rpe ?? null, rest_seconds: rest });
/** An empty-bar / light warm-up set ahead of the working sets. */
const warmup = (r: number): SetInput => ({ reps: r, set_type: "warmup", rest_seconds: 60 });
const hold = (n: number, seconds: number, rest = 45) => sets(n, { duration_seconds: seconds, rest_seconds: rest });
const distance = (n: number, meters: number, weight?: number, rest = 60) =>
  sets(n, { distance_m: meters, weight: weight ?? null, rest_seconds: rest });
/** Rounds of timed work/rest for the `intervals` measurement type. */
const intervals = (rounds: number, workS: number, restS: number): SetInput[] => [
  { extra: { rounds, work_s: workS, rest_s: restS } },
];

export const STARTERS: Starter[] = [
  {
    id: "strength-5x5",
    plan_type: "strength",
    goal: "strength",
    level: "beginner",
    equipment: ["barbell"],
    name_en: "Strength 5×5",
    name_ar: "قوة 5×5",
    days: [
      {
        label_en: "Workout A",
        label_ar: "تمرين أ",
        items: [
          { ex: "Barbell Squat", sets: [warmup(8), ...sets(5, { reps: 5, rpe_target: 8, rest_seconds: 180 })] },
          { ex: "Barbell Bench Press", sets: [warmup(8), ...sets(5, { reps: 5, rpe_target: 8, rest_seconds: 180 })] },
          { ex: "Barbell Row", sets: reps(5, 5, 180) },
        ],
      },
      {
        label_en: "Workout B",
        label_ar: "تمرين ب",
        items: [
          { ex: "Barbell Squat", sets: reps(5, 5, 180) },
          { ex: "Barbell Seated Overhead Press", sets: reps(5, 5, 180) },
          { ex: "Barbell Deadlift", sets: reps(1, 5, 240) },
        ],
      },
    ],
  },
  {
    id: "hypertrophy-ppl",
    plan_type: "hypertrophy",
    goal: "muscle",
    level: "intermediate",
    equipment: ["barbell", "dumbbell", "cable", "machine"],
    name_en: "Push / Pull / Legs",
    name_ar: "دفع / سحب / أرجل",
    days: [
      {
        label_en: "Push",
        label_ar: "دفع",
        groups: { tri: { kind: "superset" } },
        items: [
          { ex: "Barbell Bench Press", sets: range(4, 6, 8, 120, 8), notes_en: "Tempo 3-1-1-0.", notes_ar: "الإيقاع 3-1-1-0." },
          { ex: "Incline Dumbbell Press", sets: range(3, 8, 12, 90, 9) },
          { ex: "Dumbbell Lateral Raise", sets: reps(3, 15, 60), block: "accessory", group: "tri" },
          { ex: "Cable Pushdown", sets: reps(3, 12, 60), block: "accessory", group: "tri" },
        ],
      },
      {
        label_en: "Pull",
        label_ar: "سحب",
        groups: { arms: { kind: "superset" } },
        items: [
          { ex: "Pull-Up", sets: reps(4, 8, 120) },
          { ex: "Seated Cable Row", sets: reps(3, 10, 90) },
          { ex: "Lat Pulldown", sets: reps(3, 12, 90), block: "accessory" },
          { ex: "Barbell Curl", sets: reps(3, 12, 60), block: "accessory", group: "arms" },
          { ex: "Dumbbell Row", sets: reps(3, 12, 60), block: "accessory", group: "arms" },
        ],
      },
      {
        label_en: "Legs",
        label_ar: "أرجل",
        items: [
          { ex: "Barbell Squat", sets: reps(4, 8, 150) },
          { ex: "Barbell Romanian Deadlift", sets: reps(3, 10, 120) },
          { ex: "Leg Press", sets: reps(3, 12, 90), block: "accessory" },
          { ex: "Seated Leg Curl", sets: reps(3, 12, 60), block: "accessory" },
          { ex: "Lever Seated Calf Raise", sets: reps(4, 15, 45), block: "accessory" },
        ],
      },
    ],
  },
  {
    id: "crossfit-wods",
    plan_type: "crossfit",
    goal: "performance",
    level: "intermediate",
    equipment: ["barbell", "kettlebell", "medicine ball"],
    name_en: "CrossFit WOD Week",
    name_ar: "أسبوع تمارين اليوم (كروس فت)",
    days: [
      {
        label_en: "AMRAP 12",
        label_ar: "أمراب 12",
        groups: { wod: { kind: "amrap", config: { time_cap_s: 720 } } },
        items: [
          { ex: "Barbell Thruster", sets: reps(1, 10), block: "main", group: "wod" },
          { ex: "Burpee", sets: reps(1, 10), block: "main", group: "wod" },
          { ex: "Kettlebell Swing", sets: reps(1, 15), block: "main", group: "wod" },
        ],
      },
      {
        label_en: "For Time",
        label_ar: "ضد الوقت",
        groups: { wod: { kind: "for_time", config: { rounds: 3, time_cap_s: 1200 } } },
        items: [
          { ex: "Wall Ball", sets: reps(1, 15), group: "wod" },
          { ex: "Box Jump", sets: reps(1, 12), group: "wod" },
          { ex: "Pull-Up", sets: reps(1, 9), group: "wod" },
        ],
      },
      {
        label_en: "EMOM 10",
        label_ar: "إيموم 10",
        groups: { wod: { kind: "emom", config: { interval_s: 60, rounds: 10 } } },
        items: [
          { ex: "Kettlebell Swing", sets: reps(1, 15), group: "wod" },
          { ex: "Push-Up", sets: reps(1, 10), group: "wod" },
        ],
      },
    ],
  },
  {
    id: "hyrox-race",
    plan_type: "hyrox",
    goal: "performance",
    level: "intermediate",
    equipment: ["skierg machine", "sled machine", "rope", "medicine ball", "machine"],
    name_en: "Hyrox Race Simulation",
    name_ar: "محاكاة سباق هايروكس",
    days: [
      {
        label_en: "Race simulation",
        label_ar: "محاكاة السباق",
        // One round = one station; tapping "Round done" at each finish line
        // records the split.
        groups: { race: { kind: "for_time", config: { rounds: 8 } } },
        items: [
          { ex: "SkiErg", sets: distance(1, 1000), group: "race", notes_en: "Run 1 km first, then 1,000 m SkiErg.", notes_ar: "اركض 1 كم أولاً، ثم 1000 م على السكي إيرغ." },
          { ex: "Sled Push", sets: distance(1, 50, 152), group: "race", notes_en: "Run 1 km first.", notes_ar: "اركض 1 كم أولاً." },
          { ex: "Sled Pull", sets: distance(1, 50, 103), group: "race", notes_en: "Run 1 km first.", notes_ar: "اركض 1 كم أولاً." },
          { ex: "Burpee Broad Jump", sets: distance(1, 80), group: "race", notes_en: "Run 1 km first.", notes_ar: "اركض 1 كم أولاً." },
          { ex: "Rowing Machine", sets: distance(1, 1000), group: "race", notes_en: "Run 1 km first.", notes_ar: "اركض 1 كم أولاً." },
          { ex: "Farmer's Carry", sets: distance(1, 200, 24), group: "race", notes_en: "Run 1 km first. Weight is per hand.", notes_ar: "اركض 1 كم أولاً. الوزن لكل يد." },
          { ex: "Sandbag Lunges", sets: distance(1, 100, 20), group: "race", notes_en: "Run 1 km first.", notes_ar: "اركض 1 كم أولاً." },
          { ex: "Wall Ball", sets: reps(1, 100, 0, 6), group: "race", notes_en: "Run 1 km first, then finish with 100 wall balls.", notes_ar: "اركض 1 كم أولاً، ثم أنهِ بـ 100 رمية كرة." },
        ],
      },
      {
        label_en: "Stations practice",
        label_ar: "تدريب المحطات",
        items: [
          { ex: "Sled Push", sets: distance(4, 25, 100, 90) },
          { ex: "Wall Ball", sets: reps(4, 25, 60, 6) },
          { ex: "Sandbag Lunges", sets: distance(3, 50, 20, 90) },
          { ex: "Outdoor Run", sets: distance(1, 5000), block: "finisher" },
        ],
      },
    ],
  },
  {
    id: "combat-boxing",
    plan_type: "combat",
    goal: "endurance",
    level: "beginner",
    equipment: ["rope"],
    name_en: "Boxing Conditioning",
    name_ar: "لياقة الملاكمة",
    days: [
      {
        label_en: "Bag & footwork",
        label_ar: "كيس وحركة قدم",
        items: [
          { ex: "Jump Rope", sets: hold(3, 180, 60), block: "warmup" },
          { ex: "Shadow Boxing", sets: intervals(3, 180, 60) },
          { ex: "Heavy Bag Rounds", sets: intervals(5, 180, 60) },
          { ex: "Plank", sets: hold(3, 45, 30), block: "finisher" },
        ],
      },
      {
        label_en: "Conditioning",
        label_ar: "لياقة",
        groups: { circuit: { kind: "circuit" } },
        items: [
          { ex: "Burpee", sets: reps(4, 10, 60), group: "circuit" },
          { ex: "Jump Squat", sets: reps(4, 15, 60), group: "circuit" },
          { ex: "Mountain Climber", sets: reps(4, 30, 60), group: "circuit" },
          { ex: "Shadow Boxing", sets: intervals(4, 120, 30), block: "finisher" },
        ],
      },
    ],
  },
  {
    id: "calisthenics-skills",
    plan_type: "calisthenics",
    goal: "strength",
    level: "intermediate",
    equipment: ["body weight"],
    name_en: "Calisthenics Skill Foundations",
    name_ar: "أساسيات الكاليسثينكس",
    days: [
      {
        label_en: "Pull & core skills",
        label_ar: "سحب ومهارات الجذع",
        items: [
          { ex: "Dead Hang", sets: hold(3, 30, 60), block: "warmup" },
          { ex: "Pull-Up", sets: reps(5, 5, 120) },
          { ex: "L-Sit Hold", sets: hold(4, 15, 60) },
          { ex: "Hollow Body Hold", sets: hold(3, 25, 45), block: "accessory" },
        ],
      },
      {
        label_en: "Push skills",
        label_ar: "مهارات الدفع",
        items: [
          { ex: "Pike Push-Up", sets: reps(4, 8, 90) },
          { ex: "Chest Dip", sets: reps(4, 8, 90) },
          { ex: "Push-Up", sets: reps(3, 15, 60), block: "accessory" },
          { ex: "Plank", sets: hold(3, 45, 45), block: "finisher" },
        ],
      },
    ],
  },
  {
    id: "hybrid-week",
    plan_type: "hybrid",
    goal: "performance",
    level: "intermediate",
    equipment: ["barbell", "dumbbell"],
    name_en: "Hybrid Athlete Week",
    name_ar: "أسبوع الرياضي الهجين",
    days: [
      {
        label_en: "Lower strength + run",
        label_ar: "قوة أرجل + جري",
        items: [
          { ex: "Barbell Squat", sets: reps(4, 6, 150) },
          { ex: "Barbell Romanian Deadlift", sets: reps(3, 8, 120) },
          { ex: "Outdoor Run", sets: distance(1, 3000), block: "finisher" },
        ],
      },
      {
        label_en: "Run intervals",
        label_ar: "فترات جري",
        items: [
          { ex: "Outdoor Run", sets: distance(1, 2000), block: "warmup" },
          { ex: "Sprint", sets: distance(6, 400, undefined, 90) },
        ],
      },
      {
        label_en: "Upper strength + engine",
        label_ar: "قوة علوية + تحمل",
        groups: { engine: { kind: "amrap", config: { time_cap_s: 600 } } },
        items: [
          { ex: "Barbell Bench Press", sets: reps(4, 6, 150) },
          { ex: "Pull-Up", sets: reps(4, 6, 120) },
          { ex: "Kettlebell Swing", sets: reps(1, 15), block: "finisher", group: "engine" },
          { ex: "Burpee", sets: reps(1, 8), block: "finisher", group: "engine" },
        ],
      },
    ],
  },
  {
    id: "endurance-base",
    plan_type: "endurance",
    goal: "endurance",
    level: "beginner",
    equipment: ["stationary bike", "machine"],
    name_en: "Endurance Base",
    name_ar: "قاعدة التحمل",
    days: [
      { label_en: "Easy run", label_ar: "جري خفيف", items: [{ ex: "Outdoor Run", sets: distance(1, 5000) }] },
      {
        label_en: "Intervals",
        label_ar: "فترات",
        items: [
          { ex: "Outdoor Run", sets: distance(1, 1500), block: "warmup" },
          { ex: "Sprint", sets: distance(6, 400, undefined, 90) },
        ],
      },
      { label_en: "Cross-train", label_ar: "تدريب متنوع", items: [{ ex: "Cycling", sets: [{ duration_seconds: 2400 }] }, { ex: "Rowing Machine", sets: distance(1, 2000), block: "finisher" }] },
      { label_en: "Long run", label_ar: "جري طويل", items: [{ ex: "Outdoor Run", sets: distance(1, 8000) }] },
    ],
  },
  {
    id: "hiit-circuits",
    plan_type: "hiit",
    goal: "fat_loss",
    level: "beginner",
    equipment: ["body weight", "kettlebell"],
    name_en: "HIIT Circuits",
    name_ar: "دوائر هيت",
    days: [
      {
        label_en: "Tabata",
        label_ar: "تاباتا",
        groups: { tabata: { kind: "tabata", config: { work_s: 20, rest_s: 10, rounds: 8 } } },
        items: [
          { ex: "Jump Squat", sets: reps(1, 15), group: "tabata" },
          { ex: "Mountain Climber", sets: reps(1, 20), group: "tabata" },
          { ex: "High Knees", sets: hold(1, 20), group: "tabata" },
        ],
      },
      {
        label_en: "EMOM 12",
        label_ar: "إيموم 12",
        groups: { emom: { kind: "emom", config: { interval_s: 60, rounds: 12 } } },
        items: [
          { ex: "Kettlebell Swing", sets: reps(1, 15), group: "emom" },
          { ex: "Burpee", sets: reps(1, 8), group: "emom" },
          { ex: "Push-Up", sets: reps(1, 12), group: "emom" },
        ],
      },
    ],
  },
  {
    id: "mobility-daily",
    plan_type: "mobility",
    goal: "mobility",
    level: "beginner",
    equipment: ["none"],
    name_en: "Daily Mobility",
    name_ar: "مرونة يومية",
    days: [
      {
        label_en: "Mobility flow",
        label_ar: "سلسلة مرونة",
        items: [
          { ex: "Cat-Cow", sets: hold(2, 60, 15), block: "mobility" },
          { ex: "Child's Pose", sets: hold(2, 45, 15), block: "mobility" },
          { ex: "World Greatest Stretch", sets: hold(2, 45, 15), block: "mobility" },
          { ex: "Intermediate Hip Flexor and Quad Stretch", sets: hold(2, 45, 15), block: "mobility" },
        ],
      },
    ],
  },
  {
    id: "general-full-body",
    plan_type: "general",
    goal: "general",
    level: "beginner",
    equipment: ["dumbbell", "body weight"],
    name_en: "Beginner Full Body",
    name_ar: "جسم كامل للمبتدئين",
    days: [
      {
        label_en: "Full body A",
        label_ar: "جسم كامل أ",
        items: [
          { ex: "Dumbbell Goblet Squat", sets: reps(3, 12, 75) },
          { ex: "Push-Up", sets: reps(3, 10, 60) },
          { ex: "Dumbbell Row", sets: reps(3, 12, 60) },
          { ex: "Plank", sets: hold(3, 30, 45), block: "finisher" },
        ],
      },
      {
        label_en: "Full body B",
        label_ar: "جسم كامل ب",
        items: [
          { ex: "Dumbbell Lunge", sets: reps(3, 10, 75) },
          { ex: "Dumbbell Shoulder Press", sets: reps(3, 10, 75) },
          { ex: "Lat Pulldown", sets: reps(3, 12, 75) },
          { ex: "Low Glute Bridge on Floor", sets: reps(3, 15, 45), block: "finisher" },
        ],
      },
    ],
  },
  {
    id: "sport-power",
    plan_type: "sport",
    goal: "performance",
    level: "intermediate",
    equipment: ["barbell", "medicine ball"],
    name_en: "Athletic Power & Speed",
    name_ar: "قدرة وسرعة رياضية",
    days: [
      {
        label_en: "Power",
        label_ar: "قدرة",
        items: [
          { ex: "Box Jump", sets: reps(4, 5, 90) },
          { ex: "Broad Jump", sets: reps(4, 4, 90) },
          { ex: "Medicine Ball Overhead Slam", sets: reps(4, 8, 60) },
          { ex: "Barbell Front Squat", sets: reps(4, 5, 150), block: "accessory" },
        ],
      },
      {
        label_en: "Speed",
        label_ar: "سرعة",
        items: [
          { ex: "Sprint", sets: distance(8, 30, undefined, 90) },
          { ex: "Jump Squat", sets: reps(3, 8, 60), block: "accessory" },
        ],
      },
    ],
  },
  {
    id: "weightlifting-base",
    plan_type: "weightlifting",
    goal: "strength",
    level: "intermediate",
    equipment: ["barbell"],
    name_en: "Olympic Lifting Base",
    name_ar: "أساس رفع الأثقال الأولمبي",
    days: [
      {
        label_en: "Clean & jerk day",
        label_ar: "يوم النتر والكلين",
        items: [
          { ex: "Power Clean", sets: reps(5, 3, 150) },
          { ex: "Clean and Jerk", sets: reps(5, 2, 180) },
          { ex: "Barbell Front Squat", sets: reps(4, 4, 150), block: "accessory" },
        ],
      },
      {
        label_en: "Snatch day",
        label_ar: "يوم الخطف",
        items: [
          { ex: "Snatch Pull", sets: reps(5, 3, 150) },
          { ex: "Barbell Overhead Squat", sets: reps(4, 4, 150) },
          { ex: "Barbell Squat", sets: reps(4, 5, 150), block: "accessory" },
        ],
      },
    ],
  },
  {
    id: "home-minimal",
    plan_type: "home",
    goal: "general",
    level: "beginner",
    equipment: ["body weight", "band"],
    name_en: "Home — Minimal Equipment",
    name_ar: "منزلي — أدوات قليلة",
    days: [
      {
        label_en: "Full body (home)",
        label_ar: "جسم كامل (منزل)",
        groups: { circuit: { kind: "circuit" } },
        items: [
          { ex: "Band Squat", sets: reps(3, 15, 60), group: "circuit" },
          { ex: "Push-Up", sets: reps(3, 10, 60), group: "circuit" },
          { ex: "Low Glute Bridge on Floor", sets: reps(3, 15, 60), group: "circuit" },
          { ex: "Bear Crawl", sets: reps(3, 10, 60), group: "circuit" },
          { ex: "Plank", sets: hold(3, 30, 45), block: "finisher" },
        ],
      },
    ],
  },
];

export function getStarter(id: string): Starter | undefined {
  return STARTERS.find((s) => s.id === id);
}

/** Every distinct exercise name a starter references. */
export function starterExerciseNames(starter: Starter): string[] {
  return [...new Set(starter.days.flatMap((d) => d.items.map((i) => i.ex)))];
}
