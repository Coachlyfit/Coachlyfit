import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { MealStatus } from "./meal-logging";

type MealCompletion = Database["public"]["Tables"]["meal_completions"]["Row"];
type WaterLog = Database["public"]["Tables"]["daily_water_logs"]["Row"];

/** Per-meal eaten/skipped marks and water taps. The client writes their own
 * rows (RLS scopes who and which days); the coach reads by relationship. */
export class MealLoggingService {
  constructor(private db: SupabaseClient<Database>) {}

  /** Inclusive ISO date range. RLS limits which clients' rows are visible. */
  async listCompletions(clientIds: string[], from: string, to: string): Promise<MealCompletion[]> {
    const { data, error } = await this.db
      .from("meal_completions")
      .select("*")
      .in("client_id", clientIds)
      .gte("log_date", from)
      .lte("log_date", to);
    if (error) throw error;
    return data;
  }

  /** Marks (or re-marks) a meal for a day. A note is kept only when given. */
  async setMealStatus(clientId: string, mealId: string, date: string, status: MealStatus, note: string | null): Promise<void> {
    const { error } = await this.db
      .from("meal_completions")
      .upsert(
        { client_id: clientId, meal_id: mealId, log_date: date, status, note, logged_at: new Date().toISOString() },
        { onConflict: "client_id,meal_id,log_date" }
      );
    if (error) throw error;
  }

  async clearMeal(clientId: string, mealId: string, date: string): Promise<void> {
    const { error } = await this.db
      .from("meal_completions")
      .delete()
      .eq("client_id", clientId)
      .eq("meal_id", mealId)
      .eq("log_date", date);
    if (error) throw error;
  }

  async listWater(clientIds: string[], from: string, to: string): Promise<WaterLog[]> {
    const { data, error } = await this.db
      .from("daily_water_logs")
      .select("*")
      .in("client_id", clientIds)
      .gte("log_date", from)
      .lte("log_date", to);
    if (error) throw error;
    return data;
  }

  async addWater(clientId: string, date: string, amountMl: number): Promise<void> {
    const { error } = await this.db
      .from("daily_water_logs")
      .insert({ client_id: clientId, log_date: date, amount_ml: amountMl });
    if (error) throw error;
  }
}
