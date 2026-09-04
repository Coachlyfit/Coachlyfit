import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

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
};

export type CreateMealInput = { label_ar?: string; label_en?: string };
export type UpdateMealInput = Partial<CreateMealInput>;

export type CreateMealItemInput = { food_id: string; quantity?: number; unit?: string };
export type UpdateMealItemInput = Partial<CreateMealItemInput>;

export type DietPlanTree = DietPlan & {
  meals: (Meal & {
    meal_items: (MealItem & {
      foods: Pick<Food, "id" | "name_ar" | "name_en" | "category" | "kcal" | "protein_g" | "carb_g" | "fat_g">;
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

  async list(scope: DietPlanScope = "all") {
    let q = this.db
      .from("diet_plans")
      .select("*, clients(display_name)")
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    q = applyScope(q, scope);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  async listArchived() {
    const { data, error } = await this.db
      .from("diet_plans")
      .select("*, clients(display_name)")
      .not("archived_at", "is", null)
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

  /** The client's current assigned (non-template) diet plan, if any — same
   * "most recent wins, no explicit active flag" reasoning as
   * ProgramsService.getActiveTreeForClient. Used by the client app's
   * Nutrition tab. */
  async getActiveTreeForClient(clientId: string): Promise<DietPlanTree | null> {
    const { data, error } = await this.db
      .from("diet_plans")
      .select("*, meals(*, meal_items(*, foods(id, name_ar, name_en, category, kcal, protein_g, carb_g, fat_g)))")
      .eq("client_id", clientId)
      .is("archived_at", null)
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
      .select("*, meals(*, meal_items(*, foods(id, name_ar, name_en, category, kcal, protein_g, carb_g, fat_g)))")
      .eq("id", dietPlanId)
      .order("order_index", { referencedTable: "meals" })
      .order("order_index", { referencedTable: "meals.meal_items" })
      .maybeSingle();
    if (error) throw error;
    return data as DietPlanTree | null;
  }

  async create(coachId: string, input: CreateDietPlanInput): Promise<DietPlan> {
    const { data, error } = await this.db
      .from("diet_plans")
      .insert({ coach_id: coachId, client_id: input.client_id ?? null, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async update(id: string, input: Partial<Omit<CreateDietPlanInput, "client_id">>): Promise<boolean> {
    const { data, error } = await this.db.from("diet_plans").update(input).eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async remove(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("diet_plans").delete().eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** Clones a template's whole tree onto a client — same three-sequential-
   * inserts, no-transaction tradeoff as ProgramsService.cloneToClient.
   * Stamps source_template_id so listClonedInstances can find this row. */
  async cloneToClient(dietPlanId: string, clientId: string): Promise<DietPlan | null> {
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
        source_template_id: tree.id,
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
      .insert({ coach_id: parent.coach_id, client_id: parent.client_id, diet_plan_id: dietPlanId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
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
