// One-off seed: imports the openGym / hasaneyldrm/exercises-dataset library
// (MIT-licensed text data, 1,324 exercises) into public.exercises as global
// (coach_id null) rows. Media (gif_url) stays hosted on the upstream dataset
// repo's raw.githubusercontent.com URL — its images/videos are © Gym visual,
// redistributed there under a separate permission, not ours to re-host.
//
// Usage: npx tsx scripts/seed-exercises-opengym.mts
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const DATASET_PATH = process.env.EXERCISES_JSON_PATH ?? "scripts/data/exercises.json";
const MEDIA_BASE = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main";

// Our MUSCLE_GROUPS enum (src/domain/library/taxonomy.ts) vs. the dataset's
// body_part values — no glutes/full_body upstream, so those two never fire.
const BODY_PART_MAP: Record<string, string> = {
  back: "back",
  cardio: "cardio",
  chest: "chest",
  "lower arms": "arms",
  "upper arms": "arms",
  "lower legs": "legs",
  "upper legs": "legs",
  shoulders: "shoulders",
  waist: "core",
  neck: "other",
};

type SourceExercise = {
  id: string;
  name: string;
  body_part: string;
  equipment: string;
  instructions: { en: string };
  gif_url: string;
  attribution: string;
};

async function main() {
  const raw = readFileSync(DATASET_PATH, "utf-8");
  const exercises: SourceExercise[] = JSON.parse(raw);
  console.log(`loaded ${exercises.length} exercises from ${DATASET_PATH}`);

  const rows = exercises.map((ex) => {
    const instructions_en = `${ex.instructions.en}\n\n${ex.attribution}`;
    return {
      coach_id: null,
      name_ar: ex.name,
      name_en: ex.name,
      muscle_group: BODY_PART_MAP[ex.body_part] ?? "other",
      equipment: ex.equipment,
      instructions_ar: instructions_en,
      instructions_en,
      video_url: `${MEDIA_BASE}/${ex.gif_url}`,
    };
  });

  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await admin.from("exercises").insert(batch);
    if (error) throw error;
    inserted += batch.length;
    console.log(`inserted ${inserted}/${rows.length}`);
  }

  console.log("done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
