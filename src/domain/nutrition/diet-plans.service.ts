import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { planMacros } from "./macros";

type DietPlan = Database["public"]["Tables"]["diet_plans"]["Row"];
type Meal = Database["public"]["Tables"]["meals"]["Row"];
type MealItem = Database["public"]["Tables"]["meal_items"]["Row"];
type Food = Database["public"]["Tables"]["foods"]["Row"];

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

/** A program's nutrition variants with the program days linked to each —
 * the builder's variant tabs ("Training day · Days 1, 3, 5"). */
export type SiblingVariant = Pick<DietPlan, "id" | "name_ar" | "name_en" | "target_kcal"> & {
  days: { id: string; day_index: number; label_ar: string | null; label_en: string | null }[];
};

export type CreateMealItemInput = { food_id: string; quantity?: number; unit?: string };
export type UpdateMealItemInput = Partial<CreateMealItemInput>;

export type DietPlanTree = DietPlan & {
  meals: (Meal & {
    meal_items: (MealItem & {
      foods: Pick<Food, "id" | "name_ar" | "name_en" | "category" | "serving_label" | "kcal" | "protein_g" | "carb_g" | "fat_g">;
    })[];
  })[];
};

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
      .select("*, clients(display_name), meals(id, meal_items(quantity, foods(kcal, protein_g, carb_g, fat_g)))")
      .is("archived_at", null)
      .is("program_id", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data.map(({ meals, ...plan }) => ({
      ...plan,
      mealCount: meals.length,
      plannedKcal: Math.round(
        planMacros(meals.map((m) => m.meal_items.map((i) => ({ quantity: i.quantity, food: i.foods })))).kcal
      ),
    }));
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
      .select("*, meals(*, meal_items(*, foods(id, name_ar, name_en, category, serving_label, kcal, protein_g, carb_g, fat_g)))")
      .eq("client_id", clientId)
      .is("archived_at", null)
      .is("program_id", null)
      .order("created_at", { ascending: false })
      .order("order_index", { referencedTable: "meals" })
      .order("order_index", { referencedTable: "meals.meal_items" })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as DietPlanTree | null;
  }

  async getTree(dietPlanId: string): Promise<DietPlanTree | null> {
    const { data, error } = await this.db
      .from("diet_plans")
      .select("*, meals(*, meal_items(*, foods(id, name_ar, name_en, category, serving_label, kcal, protein_g, carb_g, fat_g)))")
      .eq("id", dietPlanId)
      .order("order_index", { referencedTable: "meals" })
      .order("order_index", { referencedTable: "meals.meal_items" })
      .maybeSingle();
    if (error) throw error;
    return data as DietPlanTree | null;
  }

  async create(coachId: string, input: CreateDietPlanInput): Promise<DietPlan> {
    if (input.client_id) await this.assertOwnClient(input.client_id);
    const { data, error } = await this.db
      .from("diet_plans")
      .insert({ coach_id: coachId, client_id: input.client_id ?? null, ...input })
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
      .insert({ coach_id: parent.coach_id, client_id: parent.client_id, program_id: programId, ...input })
      .select()
      .single();
    if (error) throw error;
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

    for (const meal of tree.meals) {
      const { data: clonedMeal, error: mealError } = await this.db
        .from("meals")
        .insert({
          coach_id: tree.coach_id,
          client_id: clientId,
          diet_plan_id: cloned.id,
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
            coach_id: tree.coach_id,
            client_id: clientId,
            meal_id: clonedMeal.id,
            food_id: item.food_id,
            quantity: item.quantity,
            unit: item.unit,
            order_index: item.order_index,
          }))
        );
        if (itemsError) throw itemsError;
      }
    }

    return cloned;
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

  /** Derives coach_id/client_id from the parent `diet_plans` row (RLS-scoped
   * read) rather than from any argument — see class doc. Returns null,
   * inserting nothing, when the plan isn't visible. */
  async addMeal(dietPlanId: string, input: CreateMealInput): Promise<Meal | null> {
    const { data: parent, error: parentError } = await this.db
      .from("diet_plans")
      .select("coach_id, client_id")
      .eq("id", dietPlanId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const { data, error } = await this.db
      .from("meals")
      .insert({
        coach_id: parent.coach_id,
        client_id: parent.client_id,
        diet_plan_id: dietPlanId,
        order_index: await this.nextIndex("meals", "diet_plan_id", dietPlanId),
        ...input,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Appends several meals in one insert — the builder's "start with the
   * usual meals" button. Same parent derivation as addMeal. */
  async addMeals(dietPlanId: string, inputs: CreateMealInput[]): Promise<number | null> {
    const { data: parent, error: parentError } = await this.db
      .from("diet_plans")
      .select("coach_id, client_id")
      .eq("id", dietPlanId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return null;

    const start = await this.nextIndex("meals", "diet_plan_id", dietPlanId);
    const { error } = await this.db.from("meals").insert(
      inputs.map((input, i) => ({
        coach_id: parent.coach_id,
        client_id: parent.client_id,
        diet_plan_id: dietPlanId,
        order_index: start + i,
        ...input,
      }))
    );
    if (error) throw error;
    return inputs.length;
  }

  /** Copies one meal (and its items) onto the end of `targetPlanId` —
   * "Duplicate" when the target is the meal's own plan, "Copy to Rest day"
   * when it's a sibling variant. The copy's tenant columns come from the
   * target plan via addMeal/parent lookup, never from the source meal, so
   * copying can't move data across clients. Returns null when either side
   * isn't visible. */
  async copyMeal(mealId: string, targetPlanId: string): Promise<Meal | null> {
    const { data: source, error: sourceError } = await this.db
      .from("meals")
      .select("label_ar, label_en, time_of_day, meal_items(food_id, quantity, unit, order_index)")
      .eq("id", mealId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return null;

    const meal = await this.addMeal(targetPlanId, {
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
        .select("id, name_ar, name_en, target_kcal")
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
    return variants.data.map((v) => ({
      ...v,
      days: days.data
        .filter((d) => d.diet_plan_id === v.id)
        .map(({ id, day_index, label_ar, label_en }) => ({ id, day_index, label_ar, label_en })),
    }));
  }

  /** Next order_index at the end of a parent's children. Without it every
   * new meal/item landed at order_index 0 and sorted unpredictably among
   * ties. ponytail: count-based, so a reorder that leaves gaps can collide;
   * reorderMeals/reorderItems always rewrite 0..n-1, so there are none. */
  private async nextIndex(table: "meals" | "meal_items", parentCol: "diet_plan_id" | "meal_id", parentId: string) {
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
        coach_id: parent.coach_id,
        client_id: parent.client_id,
        meal_id: mealId,
        order_index: await this.nextIndex("meal_items", "meal_id", mealId),
        food_id: input.food_id,
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
