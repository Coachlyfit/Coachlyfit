import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { planMacros } from "./macros";
import type { DietDayKind } from "./diet-days";
import { itemMacroFood } from "@/domain/recipes/recipe-nutrition";
import { requireCoachId } from "@/domain/programs/platform/ownership";

type DietPlan = Database["public"]["Tables"]["diet_plans"]["Row"];
type Meal = Database["public"]["Tables"]["meals"]["Row"];
type MealItem = Database["public"]["Tables"]["meal_items"]["Row"];
type Food = Database["public"]["Tables"]["foods"]["Row"];
type Recipe = Database["public"]["Tables"]["recipes"]["Row"];
export type DietPlanDay = Database["public"]["Tables"]["diet_plan_days"]["Row"];
export type DietPlanScheduleRow = Database["public"]["Tables"]["diet_plan_schedule"]["Row"];

/** Every plan starts with one day; the migration backfilled the same pair
 * for plans that predate days. */
export const DEFAULT_DAY_NAME = { ar: "كل الأيام", en: "Every day" } as const;

export type DietPlanScope = "all" | "assigned" | "templates";

export type CreateDietPlanInput = {
  client_id?: string | null;
  name_ar: string;
  name_en: string;
  start_date?: string;
  end_date?: string | null;
  target_kcal?: number | null;
  target_protein_g?: number | null;
  target_carb_g?: number | null;
  target_fat_g?: number | null;
  notes_ar?: string | null;
  notes_en?: string | null;
};

export type AssignTargetsInput = {
  target_kcal: number | null;
  target_protein_g: number | null;
  target_carb_g: number | null;
  target_fat_g: number | null;
  targets_source: "manual" | "suggested" | "suggested_edited";
  targets_suggestion?: Json | null;
};

export type CreateMealInput ={ label_ar?: string; label_en?: string; time_of_day?: string | null };
export type UpdateMealInput = Partial<CreateMealInput>;

export type CreateDayInput = {
  name_ar: string;
  name_en: string;
  kind: DietDayKind;
  target_kcal?: number | null;
  target_protein_g?: number | null;
  target_carb_g?: number | null;
  target_fat_g?: number | null;
  notes_ar?: string | null;
  notes_en?: string | null;
};
export type UpdateDayInput = Partial<CreateDayInput>;
/** weekday (0 = Sunday) -> day id, or null to leave that weekday unmapped. */
export type ScheduleInput = Record<number, string | null>;

/** A meal with its items, as cloneTree / duplicateDay copy them. */
type SourceMeal = Pick<Meal, "label_ar" | "label_en" | "time_of_day" | "order_index"> & {
  meal_items: Pick<MealItem, "food_id" | "recipe_id" | "quantity" | "unit" | "order_index">[];
};

/** A program's nutrition variants with the program days linked to each —
 * the builder's variant tabs ("Training day · Days 1, 3, 5"). */
export type SiblingVariant = Pick<DietPlan, "id" | "name_ar" | "name_en" | "target_kcal"> & {
  days: { id: string; day_index: number; label_ar: string | null; label_en: string | null }[];
  /** The variant's first plan day: where a meal copied "to this variant" lands. */
  first_day_id: string | null;
};

/** A meal item is a food or a recipe (meal_items_food_or_recipe), never both. */
export type CreateMealItemInput =
  | { food_id: string; recipe_id?: never; quantity?: number; unit?: string }
  | { recipe_id: string; food_id?: never; quantity?: number; unit?: string };
export type UpdateMealItemInput = { food_id?: string; quantity?: number; unit?: string };

const TREE_FOOD_FIELDS = "id, name_ar, name_en, category, serving_label, kcal, protein_g, carb_g, fat_g";
type TreeFood = Pick<Food, "id" | "name_ar" | "name_en" | "category" | "serving_label" | "kcal" | "protein_g" | "carb_g" | "fat_g">;

/** Everything the builder and the client's recipe sheet render, fetched
 * with the plan in one query: no per-recipe round trip. */
const TREE_MEAL_ITEMS = `meal_items(*, foods(${TREE_FOOD_FIELDS}), recipes(id, name_ar, name_en, description, servings, prep_minutes, cook_minutes, steps, video_url, image_path, archived_at, recipe_ingredients(id, quantity, unit, position, note, foods(${TREE_FOOD_FIELDS}))))`;

export type TreeRecipe = Pick<
  Recipe,
  | "id"
  | "name_ar"
  | "name_en"
  | "description"
  | "servings"
  | "prep_minutes"
  | "cook_minutes"
  | "steps"
  | "video_url"
  | "image_path"
  | "archived_at"
> & {
  recipe_ingredients: { id: string; quantity: number; unit: string; position: number; note: string | null; foods: TreeFood | null }[];
};

export type DietPlanTree = DietPlan & {
  diet_plan_days: DietPlanDay[];
  diet_plan_schedule: DietPlanScheduleRow[];
  meals: (Meal & {
    meal_items: (MealItem & { foods: TreeFood | null; recipes: TreeRecipe | null })[];
  })[];
};

const TREE_SELECT = `*, diet_plan_days(*), diet_plan_schedule(*), meals(*, ${TREE_MEAL_ITEMS})`;

/** Ingredient order isn't something PostgREST sorts reliably through a
 * to-one embed, so it's done here, once, for every tree reader. */
function sortRecipeIngredients(tree: DietPlanTree): DietPlanTree {
  for (const meal of tree.meals) {
    for (const item of meal.meal_items) {
      item.recipes?.recipe_ingredients.sort((a, b) => a.position - b.position);
    }
  }
  return tree;
}

/** `client_id is null` on a nullable-FK own filter — same idiom as
 * ProgramsService.applyScope / LibraryService's `applySource`. */
function applyScope<Q extends { is: (c: "client_id", v: null) => Q; not: (c: "client_id", op: "is", v: null) => Q }>(
  q: Q,
  scope: DietPlanScope
): Q {
  if (scope === "templates") return q.is("client_id", null);
  if (scope === "assigned") return q.not("client_id", "is", null);
  return q;
}

/** Coach-authored diet plans: standalone (assigned to one client) or
 * templates (client_id null, cloned onto a client later). Deliberately
 * mirrors ProgramsService's shape one-for-one — same scope model, same
 * clone-by-walking-the-tree approach, same "no transaction, a partial clone
 * leaves an orphan the coach can delete" tradeoff. Unlike ProgramsService's
 * cloneToClient, this one DOES stamp source_template_id on the clone (see
 * listClonedInstances below, which depends on it).
 *
 * Same derivation rule as ProgramsService: `meals` and `meal_items` carry
 * their own coach_id/client_id, always read off the RLS-scoped parent row,
 * never taken from a caller-supplied argument — see ProgramsService's class
 * doc for why. */
export class DietPlansService {
  constructor(private db: SupabaseClient<Database>) {}

  /** Same RLS-scoped guard as ProgramsService.assertOwnClient — see there
   * for why the FK alone isn't enough. */
  private async assertOwnClient(clientId: string): Promise<void> {
    const { data, error } = await this.db.from("clients").select("id").eq("id", clientId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("client_not_found_or_forbidden");
  }

  /** Standalone plans only (program_id null) — a program-owned nutrition
   * variant lives in the program builder's Nutrition panel, not the
   * top-level /diets list, even though it's edited through the same
   * getTree/meal builder. */
  async list(scope: DietPlanScope = "all") {
    let q = this.db
      .from("diet_plans")
      .select("*, clients(display_name)")
      .is("archived_at", null)
      .is("program_id", null)
      .order("created_at", { ascending: false });
    q = applyScope(q, scope);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  /** list() plus each plan's meal count and planned daily kcal, for the
   * /diets cards — one request, the meals come back nested.
   * ponytail: ships every meal item to sum it here; move to a
   * security_invoker view (see coach_client_roster) if the payload gets heavy. */
  async listOverview() {
    const { data, error } = await this.db
      .from("diet_plans")
      .select(
        "*, clients(display_name), diet_plan_days(id, order_index), meals(id, diet_plan_day_id, meal_items(quantity, foods(kcal, protein_g, carb_g, fat_g), recipes(servings, recipe_ingredients(quantity, unit, foods(serving_label, kcal, protein_g, carb_g, fat_g)))))"
      )
      .is("archived_at", null)
      .is("program_id", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data.map(({ meals: allMeals, diet_plan_days, ...plan }) => {
      // A card shows one day's worth, not every day summed together: the
      // first day, which is the whole plan for a single-day plan.
      const firstDay = [...diet_plan_days].sort((a, b) => a.order_index - b.order_index)[0];
      const meals = allMeals.filter((m) => m.diet_plan_day_id === firstDay?.id);
      return {
        ...plan,
        mealCount: meals.length,
        plannedKcal: Math.round(
          planMacros(meals.map((m) => m.meal_items.map((i) => ({ quantity: i.quantity, food: itemMacroFood(i) })))).kcal
        ),
      };
    });
  }

  async listArchived() {
    const { data, error } = await this.db
      .from("diet_plans")
      .select("*, clients(display_name)")
      .not("archived_at", "is", null)
      .is("program_id", null)
      .order("archived_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async archive(id: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("diet_plans")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async restore(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("diet_plans").update({ archived_at: null }).eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** The client's current assigned (non-template) STANDALONE diet plan, if
   * any — same "most recent wins, no explicit active flag" reasoning as
   * ProgramsService.getActiveTreeForClient. Program-owned variants are
   * excluded: they're resolved per-day via day-plan.ts off the client's
   * active program instead, and only used as a fallback when that day has
   * no linked variant. Used by the client app's Nutrition tab fallback. */
  async getActiveTreeForClient(clientId: string): Promise<DietPlanTree | null> {
    const { data, error } = await this.db
      .from("diet_plans")
      .select(TREE_SELECT)
      .eq("client_id", clientId)
      .is("archived_at", null)
      .is("program_id", null)
      .order("created_at", { ascending: false })
      .order("order_index", { referencedTable: "diet_plan_days" })
      .order("order_index", { referencedTable: "meals" })
      .order("order_index", { referencedTable: "meals.meal_items" })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? sortRecipeIngredients(data as DietPlanTree) : null;
  }

  async getTree(dietPlanId: string): Promise<DietPlanTree | null> {
    const { data, error } = await this.db
      .from("diet_plans")
      .select(TREE_SELECT)
      .eq("id", dietPlanId)
      .order("order_index", { referencedTable: "diet_plan_days" })
      .order("order_index", { referencedTable: "meals" })
      .order("order_index", { referencedTable: "meals.meal_items" })
      .maybeSingle();
    if (error) throw error;
    return data ? sortRecipeIngredients(data as DietPlanTree) : null;
  }

  async create(coachId: string, input: CreateDietPlanInput): Promise<DietPlan> {
    if (input.client_id) await this.assertOwnClient(input.client_id);
    const { data, error } = await this.db
      .from("diet_plans")
      .insert({ coach_id: coachId, client_id: input.client_id ?? null, ...input })
      .select()
      .single();
    if (error) throw error;
    await this.createDefaultDay(data);
    return data;
  }

  /** The one day every plan has to have (meals.diet_plan_day_id is NOT NULL),
   * carrying the plan's targets. Called by every path that inserts a plan
   * without cloning its days. */
  private async createDefaultDay(plan: DietPlan): Promise<DietPlanDay> {
    const { data, error } = await this.db
      .from("diet_plan_days")
      .insert({
        diet_plan_id: plan.id,
        coach_id: plan.coach_id,
        client_id: plan.client_id,
        name_ar: DEFAULT_DAY_NAME.ar,
        name_en: DEFAULT_DAY_NAME.en,
        kind: "custom",
        order_index: 0,
        target_kcal: plan.target_kcal,
        target_protein_g: plan.target_protein_g,
        target_carb_g: plan.target_carb_g,
        target_fat_g: plan.target_fat_g,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Creates a nutrition variant owned by a program — same insert as
   * create(), plus program_id, and client_id derived from the parent
   * program (RLS-scoped read) rather than trusted from an argument, same
   * derivation rule as ProgramsService's child inserts. A variant has no
   * client_id of its own to pass: it belongs to the program, which may
   * itself be a template (client_id null). */
  async createForProgram(
    programId: string,
    input: Omit<CreateDietPlanInput, "client_id">
  ): Promise<DietPlan | null> {
    const { data: parent, error: parentError } = await this.db
      .from("programs")
      .select("coach_id, client_id")
      .eq("id", programId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const { data, error } = await this.db
      .from("diet_plans")
      .insert({ coach_id: requireCoachId(parent), client_id: parent.client_id, program_id: programId, ...input })
      .select()
      .single();
    if (error) throw error;
    await this.createDefaultDay(data);
    return data;
  }

  /** "Customize for this day": clones the day's currently-linked variant
   * and repoints just that one day at the clone, leaving every other day
   * that shared the original variant untouched. Returns the new plan's id,
   * or null if the day has no linked variant to customize (nothing to
   * clone) or isn't visible. */
  async customizeForDay(dayId: string): Promise<DietPlan | null> {
    const { data: day, error: dayError } = await this.db
      .from("program_days")
      .select("program_id, diet_plan_id, client_id")
      .eq("id", dayId)
      .maybeSingle();
    if (dayError) throw dayError;
    if (!day || !day.diet_plan_id) return null;

    const clone = await this.cloneTreeForProgram(day.diet_plan_id, day.client_id, day.program_id);
    if (!clone) return null;

    const { error: repointError } = await this.db
      .from("program_days")
      .update({ diet_plan_id: clone.id })
      .eq("id", dayId);
    if (repointError) throw repointError;

    return clone;
  }

  async update(
    id: string,
    input: Partial<Omit<CreateDietPlanInput, "client_id">> &
      Partial<Pick<AssignTargetsInput, "targets_source" | "targets_suggestion">>
  ): Promise<boolean> {
    const { data, error } = await this.db.from("diet_plans").update(input).eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Renames a plan without touching its dates/targets/notes. Same RLS
   * boundary as ProgramsService.renameProgram: coach_rw UPDATE on
   * diet_plans (20260731000008_plans.sql) scopes this to the owner coach,
   * and clients have no UPDATE policy of their own. */
  async renameDiet(id: string, input: { name_ar: string; name_en: string }): Promise<boolean> {
    const { data, error } = await this.db.from("diet_plans").update(input).eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Writes a plan's targets together with where they came from — the
   * macro suggestion (as-is or edited) or a hand-typed "manual" set — and,
   * for suggestions, a snapshot of what was suggested. */
  async assignTargets(id: string, input: AssignTargetsInput): Promise<boolean> {
    const { data, error } = await this.db
      .from("diet_plans")
      .update({ ...input, targets_suggestion: input.targets_suggestion ?? null })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async remove(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("diet_plans").delete().eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Deep-copies a whole diet plan tree, retargeting every row's client_id.
   * `clientId` non-null assigns the copy to that client; null produces a
   * template. Same three-sequential-inserts, no-transaction tradeoff as
   * ProgramsService.cloneToClient. Stamps source_template_id only when
   * cloning *out* to a client, so listClonedInstances can find this row —
   * a template saved back from an assigned plan has no source template. */
  private async cloneTree(
    dietPlanId: string,
    clientId: string | null,
    overrides: Partial<
      Pick<DietPlan, "name_ar" | "name_en" | "start_date" | "end_date" | "program_id" | "source_template_id">
    > = {}
  ): Promise<DietPlan | null> {
    const tree = await this.getTree(dietPlanId);
    if (!tree) return null;

    const { data: cloned, error: planError } = await this.db
      .from("diet_plans")
      .insert({
        coach_id: tree.coach_id,
        client_id: clientId,
        name_ar: tree.name_ar,
        name_en: tree.name_en,
        start_date: tree.start_date,
        end_date: tree.end_date,
        program_id: tree.program_id,
        target_kcal: tree.target_kcal,
        target_protein_g: tree.target_protein_g,
        target_carb_g: tree.target_carb_g,
        target_fat_g: tree.target_fat_g,
        notes_ar: tree.notes_ar,
        notes_en: tree.notes_en,
        source_template_id: clientId ? tree.id : null,
        ...overrides,
      })
      .select()
      .single();
    if (planError) throw planError;

    // Days first (meals point at them), remembering old id -> new id.
    const dayIds = new Map<string, string>();
    for (const day of tree.diet_plan_days) {
      const { data: clonedDay, error: dayError } = await this.db
        .from("diet_plan_days")
        .insert({
          diet_plan_id: cloned.id,
          coach_id: tree.coach_id,
          client_id: clientId,
          name_ar: day.name_ar,
          name_en: day.name_en,
          kind: day.kind,
          order_index: day.order_index,
          target_kcal: day.target_kcal,
          target_protein_g: day.target_protein_g,
          target_carb_g: day.target_carb_g,
          target_fat_g: day.target_fat_g,
          water_target_ml: day.water_target_ml,
          notes_ar: day.notes_ar,
          notes_en: day.notes_en,
        })
        .select()
        .single();
      if (dayError) throw dayError;
      dayIds.set(day.id, clonedDay.id);

      await this.insertMeals(
        tree.meals.filter((m) => m.diet_plan_day_id === day.id),
        { coachId: tree.coach_id, clientId, planId: cloned.id, dayId: clonedDay.id }
      );
    }

    // A plan with no days can't hold meals, but it still needs its one day.
    if (tree.diet_plan_days.length === 0) await this.createDefaultDay(cloned);

    const schedule = tree.diet_plan_schedule.flatMap((s) => {
      const diet_plan_day_id = dayIds.get(s.diet_plan_day_id);
      return diet_plan_day_id
        ? [{ diet_plan_id: cloned.id, weekday: s.weekday, diet_plan_day_id, coach_id: tree.coach_id, client_id: clientId }]
        : [];
    });
    if (schedule.length > 0) {
      const { error: scheduleError } = await this.db.from("diet_plan_schedule").insert(schedule);
      if (scheduleError) throw scheduleError;
    }

    return cloned;
  }

  /** Inserts copies of `meals` (and their items) under one day. Tenant
   * columns come from the caller's RLS-scoped parent row, never from the
   * source meals. */
  private async insertMeals(
    meals: SourceMeal[],
    target: { coachId: string; clientId: string | null; planId: string; dayId: string }
  ): Promise<void> {
    for (const meal of meals) {
      const { data: clonedMeal, error: mealError } = await this.db
        .from("meals")
        .insert({
          coach_id: target.coachId,
          client_id: target.clientId,
          diet_plan_id: target.planId,
          diet_plan_day_id: target.dayId,
          order_index: meal.order_index,
          label_ar: meal.label_ar,
          label_en: meal.label_en,
          time_of_day: meal.time_of_day,
        })
        .select()
        .single();
      if (mealError) throw mealError;

      if (meal.meal_items.length > 0) {
        const { error: itemsError } = await this.db.from("meal_items").insert(
          meal.meal_items.map((item) => ({
            coach_id: target.coachId,
            client_id: target.clientId,
            meal_id: clonedMeal.id,
            food_id: item.food_id,
            recipe_id: item.recipe_id,
            quantity: item.quantity,
            unit: item.unit,
            order_index: item.order_index,
          }))
        );
        if (itemsError) throw itemsError;
      }
    }
  }

  /** Clones a template's whole tree onto a client, starting today — see
   * ProgramsService.cloneToClient for why. `replaceActive` soft-archives
   * the client's other active plans after cloning, same as there. */
  async cloneToClient(dietPlanId: string, clientId: string, replaceActive = false): Promise<DietPlan | null> {
    await this.assertOwnClient(clientId);
    const today = new Date().toISOString().slice(0, 10);
    const cloned = await this.cloneTree(dietPlanId, clientId, { start_date: today });
    if (!cloned) return null;

    if (replaceActive) {
      const { error } = await this.db
        .from("diet_plans")
        .update({ archived_at: new Date().toISOString() })
        .eq("client_id", clientId)
        .neq("id", cloned.id)
        .is("archived_at", null);
      if (error) throw error;
    }

    return cloned;
  }

  /** The reverse of cloneToClient: copies an assigned plan back out as a
   * reusable template. `end_date` is dropped — see ProgramsService.saveAsTemplate. */
  async saveAsTemplate(dietPlanId: string, name_ar?: string, name_en?: string): Promise<DietPlan | null> {
    return this.cloneTree(dietPlanId, null, {
      end_date: null,
      ...(name_ar ? { name_ar } : {}),
      ...(name_en ? { name_en } : {}),
    });
  }

  /** Clones a program-owned nutrition variant onto a NEW program (used by
   * ProgramsService.cloneTree when cloning a whole program/template) —
   * stamps the clone's program_id directly rather than going through
   * assertOwnClient/cloneToClient, since the caller (ProgramsService) has
   * already validated clientId belongs to this coach before cloning
   * anything. Keeps the plan's own start_date/end_date as-is: a variant
   * has no independent lifecycle, it just tags along with its program. */
  async cloneTreeForProgram(dietPlanId: string, clientId: string | null, programId: string): Promise<DietPlan | null> {
    return this.cloneTree(dietPlanId, clientId, { program_id: programId } as never);
  }

  /** The tenant columns a meal under `dayId` must carry, read off the
   * RLS-scoped day row. The `diet_plan_id` filter doubles as the check that
   * the day belongs to that plan — null for a day that's invisible or
   * belongs to another plan. */
  private async dayParent(dietPlanId: string, dayId: string) {
    const { data, error } = await this.db
      .from("diet_plan_days")
      .select("coach_id, client_id")
      .eq("id", dayId)
      .eq("diet_plan_id", dietPlanId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Derives coach_id/client_id from the parent day row (RLS-scoped read)
   * rather than from any argument — see class doc. Returns null, inserting
   * nothing, when the day isn't visible or isn't part of `dietPlanId`. */
  async addMeal(dietPlanId: string, dayId: string, input: CreateMealInput): Promise<Meal | null> {
    const parent = await this.dayParent(dietPlanId, dayId);
    if (!parent) return null;

    const { data, error } = await this.db
      .from("meals")
      .insert({
        coach_id: requireCoachId(parent),
        client_id: parent.client_id,
        diet_plan_id: dietPlanId,
        diet_plan_day_id: dayId,
        order_index: await this.nextIndex("meals", "diet_plan_day_id", dayId),
        ...input,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Appends several meals in one insert — the builder's "start with the
   * usual meals" button. Same parent derivation as addMeal. */
  async addMeals(dietPlanId: string, dayId: string, inputs: CreateMealInput[]): Promise<number | null> {
    const parent = await this.dayParent(dietPlanId, dayId);
    if (!parent) return null;

    const start = await this.nextIndex("meals", "diet_plan_day_id", dayId);
    const { error } = await this.db.from("meals").insert(
      inputs.map((input, i) => ({
        coach_id: requireCoachId(parent),
        client_id: parent.client_id,
        diet_plan_id: dietPlanId,
        diet_plan_day_id: dayId,
        order_index: start + i,
        ...input,
      }))
    );
    if (error) throw error;
    return inputs.length;
  }

  /** Adds a day-type to a plan, after the existing ones. */
  async addDay(dietPlanId: string, input: CreateDayInput): Promise<DietPlanDay | null> {
    const { data: parent, error: parentError } = await this.db
      .from("diet_plans")
      .select("coach_id, client_id")
      .eq("id", dietPlanId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const { data, error } = await this.db
      .from("diet_plan_days")
      .insert({
        coach_id: requireCoachId(parent),
        client_id: parent.client_id,
        diet_plan_id: dietPlanId,
        order_index: await this.dayCount(dietPlanId),
        ...input,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateDay(dayId: string, input: UpdateDayInput): Promise<boolean> {
    const { data, error } = await this.db.from("diet_plan_days").update(input).eq("id", dayId).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async getDay(dayId: string): Promise<DietPlanDay | null> {
    const { data, error } = await this.db.from("diet_plan_days").select("*").eq("id", dayId).maybeSingle();
    if (error) throw error;
    return data;
  }

  /** The plan's first day (lowest order_index), or null for a plan without
   * any visible day. */
  async getFirstDay(dietPlanId: string): Promise<DietPlanDay | null> {
    const { data, error } = await this.db
      .from("diet_plan_days")
      .select("*")
      .eq("diet_plan_id", dietPlanId)
      .order("order_index")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Sets a day's four targets. The plan's first day also writes them to
   * diet_plans.target_*, the overall / fallback values that the plan list,
   * print view and a day without targets of its own read — so for a
   * single-day plan nothing changed from before days existed — along with
   * where they came from. Default provenance is "typed by hand", so no
   * longer a macro suggestion's numbers. */
  async updateDayTargets(
    dayId: string,
    // water_target_ml belongs to the day only; diet_plans has no such column.
    { water_target_ml, ...targets }: Pick<DietPlanDay, "target_kcal" | "target_protein_g" | "target_carb_g" | "target_fat_g"> & {
      water_target_ml?: number | null;
    },
    provenance: Pick<AssignTargetsInput, "targets_source" | "targets_suggestion"> = {
      targets_source: "manual",
      targets_suggestion: null,
    }
  ): Promise<boolean> {
    const { data, error } = await this.db
      .from("diet_plan_days")
      .update(water_target_ml === undefined ? targets : { ...targets, water_target_ml })
      .eq("id", dayId)
      .select("id, diet_plan_id");
    if (error) throw error;
    const day = data[0];
    if (!day) return false;

    const { data: first, error: firstError } = await this.db
      .from("diet_plan_days")
      .select("id")
      .eq("diet_plan_id", day.diet_plan_id)
      .order("order_index")
      .limit(1)
      .maybeSingle();
    if (firstError) throw firstError;
    if (first?.id === day.id) {
      await this.update(day.diet_plan_id, { ...targets, ...provenance });
    }
    return true;
  }

  /** Deletes a day with its meals (cascade) and schedule rows. A plan always
   * keeps at least one day, so the last one is refused. */
  async removeDay(dayId: string): Promise<"deleted" | "last_day" | "not_found"> {
    const { data: day, error: dayError } = await this.db
      .from("diet_plan_days")
      .select("diet_plan_id")
      .eq("id", dayId)
      .maybeSingle();
    if (dayError) throw dayError;
    if (!day) return "not_found";
    if ((await this.dayCount(day.diet_plan_id)) <= 1) return "last_day";

    const { data, error } = await this.db.from("diet_plan_days").delete().eq("id", dayId).select("id");
    if (error) throw error;
    return data.length > 0 ? "deleted" : "not_found";
  }

  /** Copies a day with all its meals and items, as a new day at the end of
   * the same plan. The schedule isn't copied: a weekday maps to one day. */
  async duplicateDay(dayId: string, name_ar: string, name_en: string): Promise<DietPlanDay | null> {
    const { data: source, error: sourceError } = await this.db
      .from("diet_plan_days")
      .select(
        "*, meals(label_ar, label_en, time_of_day, order_index, meal_items(food_id, recipe_id, quantity, unit, order_index))"
      )
      .eq("id", dayId)
      .order("order_index", { referencedTable: "meals" })
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return null;

    const { data: day, error } = await this.db
      .from("diet_plan_days")
      .insert({
        diet_plan_id: source.diet_plan_id,
        coach_id: source.coach_id,
        client_id: source.client_id,
        kind: source.kind,
        target_kcal: source.target_kcal,
        target_protein_g: source.target_protein_g,
        target_carb_g: source.target_carb_g,
        target_fat_g: source.target_fat_g,
        water_target_ml: source.water_target_ml,
        notes_ar: source.notes_ar,
        notes_en: source.notes_en,
        name_ar,
        name_en,
        order_index: await this.dayCount(source.diet_plan_id),
      })
      .select()
      .single();
    if (error) throw error;

    await this.insertMeals(source.meals, {
      coachId: day.coach_id,
      clientId: day.client_id,
      planId: day.diet_plan_id,
      dayId: day.id,
    });
    return day;
  }

  /** Replaces the weekday -> day map. A weekday set to null is left unmapped
   * (it falls back to the first training day when read). Days must belong to
   * `dietPlanId`: the composite FK rejects a day of any other plan. */
  async setSchedule(dietPlanId: string, schedule: ScheduleInput): Promise<boolean> {
    const { data: parent, error: parentError } = await this.db
      .from("diet_plans")
      .select("coach_id, client_id")
      .eq("id", dietPlanId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return false;

    const entries = Object.entries(schedule).map(([weekday, dayId]) => [Number(weekday), dayId] as const);
    const mapped = entries.flatMap(([weekday, dayId]) =>
      dayId
        ? [
            {
              diet_plan_id: dietPlanId,
              weekday,
              diet_plan_day_id: dayId,
              coach_id: requireCoachId(parent),
              client_id: parent.client_id,
            },
          ]
        : []
    );
    const cleared = entries.filter(([, dayId]) => !dayId).map(([weekday]) => weekday);

    if (cleared.length > 0) {
      const { error } = await this.db
        .from("diet_plan_schedule")
        .delete()
        .eq("diet_plan_id", dietPlanId)
        .in("weekday", cleared);
      if (error) throw error;
    }
    if (mapped.length > 0) {
      const { error } = await this.db
        .from("diet_plan_schedule")
        .upsert(mapped, { onConflict: "diet_plan_id,weekday" });
      if (error) throw error;
    }
    return true;
  }

  private async dayCount(dietPlanId: string): Promise<number> {
    const { count, error } = await this.db
      .from("diet_plan_days")
      .select("id", { count: "exact", head: true })
      .eq("diet_plan_id", dietPlanId);
    if (error) throw error;
    return count ?? 0;
  }

  /** Copies one meal (and its items) onto the end of `targetDayId` (a day of
   * `targetPlanId`) — "Duplicate" when the target is the meal's own day,
   * "Copy to Rest day" for a sibling day or a program variant. The copy's
   * tenant columns come from the target day via addMeal/parent lookup, never
   * from the source meal, so copying can't move data across clients. Returns
   * null when either side isn't visible. */
  async copyMeal(mealId: string, targetPlanId: string, targetDayId: string): Promise<Meal | null> {
    const { data: source, error: sourceError } = await this.db
      .from("meals")
      .select("label_ar, label_en, time_of_day, meal_items(food_id, recipe_id, quantity, unit, order_index)")
      .eq("id", mealId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return null;

    const meal = await this.addMeal(targetPlanId, targetDayId, {
      label_ar: source.label_ar ?? undefined,
      label_en: source.label_en ?? undefined,
      time_of_day: source.time_of_day,
    });
    if (!meal) return null;

    if (source.meal_items.length > 0) {
      const { error } = await this.db.from("meal_items").insert(
        source.meal_items.map((item) => ({
          coach_id: meal.coach_id,
          client_id: meal.client_id,
          meal_id: meal.id,
          food_id: item.food_id,
          recipe_id: item.recipe_id,
          quantity: item.quantity,
          unit: item.unit,
          order_index: item.order_index,
        }))
      );
      if (error) throw error;
    }
    return meal;
  }

  /** Whole-plan copy that stays where it is — same client, same program
   * (if any) — under new names. Used for "Duplicate as new variant", e.g.
   * building Rest day from a finished Training day. Not a template/instance
   * relationship, so source_template_id stays null. */
  async duplicate(dietPlanId: string, name_ar: string, name_en: string): Promise<DietPlan | null> {
    const { data: source, error } = await this.db
      .from("diet_plans")
      .select("client_id")
      .eq("id", dietPlanId)
      .maybeSingle();
    if (error) throw error;
    if (!source) return null;
    return this.cloneTree(dietPlanId, source.client_id, { name_ar, name_en, source_template_id: null });
  }

  async listSiblingVariants(programId: string): Promise<SiblingVariant[]> {
    const [variants, days] = await Promise.all([
      this.db
        .from("diet_plans")
        .select("id, name_ar, name_en, target_kcal, diet_plan_days(id, order_index)")
        .eq("program_id", programId)
        .is("archived_at", null)
        .order("created_at"),
      this.db
        .from("program_days")
        .select("id, day_index, label_ar, label_en, diet_plan_id")
        .eq("program_id", programId)
        .order("day_index"),
    ]);
    if (variants.error) throw variants.error;
    if (days.error) throw days.error;
    return variants.data.map(({ diet_plan_days, ...v }) => ({
      ...v,
      first_day_id: [...diet_plan_days].sort((a, b) => a.order_index - b.order_index)[0]?.id ?? null,
      days: days.data
        .filter((d) => d.diet_plan_id === v.id)
        .map(({ id, day_index, label_ar, label_en }) => ({ id, day_index, label_ar, label_en })),
    }));
  }

  /** Next order_index at the end of a parent's children. Without it every
   * new meal/item landed at order_index 0 and sorted unpredictably among
   * ties. ponytail: count-based, so a reorder that leaves gaps can collide;
   * reorderMeals/reorderItems always rewrite 0..n-1, so there are none. */
  private async nextIndex(
    table: "meals" | "meal_items",
    parentCol: "diet_plan_day_id" | "meal_id",
    parentId: string
  ) {
    const { count, error } = await this.db
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(parentCol as never, parentId);
    if (error) throw error;
    return count ?? 0;
  }

  async updateMeal(mealId: string, input: UpdateMealInput): Promise<boolean> {
    const { data, error } = await this.db.from("meals").update(input).eq("id", mealId).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async removeMeal(mealId: string): Promise<boolean> {
    const { data, error } = await this.db.from("meals").delete().eq("id", mealId).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Same derivation, one level deeper — parent is `meals`. */
  async addItem(mealId: string, input: CreateMealItemInput): Promise<MealItem | null> {
    const { data: parent, error: parentError } = await this.db
      .from("meals")
      .select("coach_id, client_id")
      .eq("id", mealId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const { data, error } = await this.db
      .from("meal_items")
      .insert({
        coach_id: requireCoachId(parent),
        client_id: parent.client_id,
        meal_id: mealId,
        order_index: await this.nextIndex("meal_items", "meal_id", mealId),
        food_id: input.food_id ?? null,
        recipe_id: input.recipe_id ?? null,
        quantity: input.quantity ?? 1,
        unit: input.unit ?? "serving",
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateItem(itemId: string, input: UpdateMealItemInput): Promise<boolean> {
    const { data, error } = await this.db.from("meal_items").update(input).eq("id", itemId).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async removeItem(itemId: string): Promise<boolean> {
    const { data, error } = await this.db.from("meal_items").delete().eq("id", itemId).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** N scoped updates, not an upsert — same ponytail tradeoff as
   * ProgramsService.reorderDays: N < 20 (a plan's meal count) per drag. */
  async reorderMeals(dietPlanId: string, orderedIds: string[]): Promise<number> {
    let count = 0;
    for (let i = 0; i < orderedIds.length; i++) {
      const { data, error } = await this.db
        .from("meals")
        .update({ order_index: i })
        .eq("id", orderedIds[i])
        .eq("diet_plan_id", dietPlanId)
        .select("id");
      if (error) throw error;
      count += data.length;
    }
    return count;
  }

  async reorderItems(mealId: string, orderedIds: string[]): Promise<number> {
    let count = 0;
    for (let i = 0; i < orderedIds.length; i++) {
      const { data, error } = await this.db
        .from("meal_items")
        .update({ order_index: i })
        .eq("id", orderedIds[i])
        .eq("meal_id", mealId)
        .select("id");
      if (error) throw error;
      count += data.length;
    }
    return count;
  }

  /** Every client instance cloned from this template, for the template
   * detail page's "assigned to N clients" list. */
  async listClonedInstances(templateId: string) {
    const { data, error } = await this.db
      .from("diet_plans")
      .select("*, clients(display_name)")
      .eq("source_template_id", templateId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }
}
