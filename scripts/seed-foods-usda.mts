// One-off seed: imports a curated ~150-item whole-food set sourced from USDA
// FoodData Central (Foundation Foods, public domain — real per-100g macros,
// no fabricated values) into public.foods as global (coach_id null) rows.
// Curation + macro extraction + Arabic translation done via a workflow that
// independently re-verified a 20-item sample against the raw USDA source
// before this file was written — see scripts/data/foods-usda.json for the
// fdc_id each row traces back to.
//
// Usage: npx tsx scripts/seed-foods-usda.mts
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const DATASET_PATH = process.env.FOODS_JSON_PATH ?? "scripts/data/foods-usda.json";

type SourceFood = {
  name_en: string;
  name_ar: string;
  category: "protein" | "carbs" | "fats" | "vegetables" | "fruits" | "dairy" | "other";
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  fdc_id: string;
};

async function main() {
  const raw = readFileSync(DATASET_PATH, "utf-8");
  const foods: SourceFood[] = JSON.parse(raw);
  console.log(`loaded ${foods.length} foods from ${DATASET_PATH}`);

  const rows = foods.map((f) => ({
    coach_id: null,
    name_ar: f.name_ar,
    name_en: f.name_en,
    category: f.category,
    serving_label: "100g",
    kcal: f.kcal,
    protein_g: f.protein_g,
    carb_g: f.carb_g,
    fat_g: f.fat_g,
    notes_en: `USDA FoodData Central fdcId ${f.fdc_id}`,
  }));

  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await admin.from("foods").insert(batch);
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
