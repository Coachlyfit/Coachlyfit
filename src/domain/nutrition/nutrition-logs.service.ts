import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { dueReminderDate, localDateTime } from "./reminders";
import { suggestMacroTargets, type Goal, type SuggestInput, type SuggestResult } from "./suggest-targets";
import type { ActivityLevel, Sex } from "./calories";

type NutritionLog = Database["public"]["Tables"]["nutrition_logs"]["Row"];
type BodyProfile = Database["public"]["Tables"]["client_body_profiles"]["Row"];
type ReminderSettingsRow = Database["public"]["Tables"]["nutrition_reminder_settings"]["Row"];

export type LogIntakeInput = {
  log_date: string;
  kcal: number;
  protein_g?: number | null;
  carb_g?: number | null;
  fat_g?: number | null;
};

export type OffPlanInput = {
  log_date: string;
  meal?: string | null;
  note?: string | null;
  kcal?: number | null;
  photo_path?: string | null;
};

export type BodyProfileInput = Partial<Omit<BodyProfile, "client_id" | "created_at">>;

export type ReminderSettingsInput = Pick<ReminderSettingsRow, "enabled" | "remind_at" | "timezone">;

/** Client intake logs (one row per client per day; kcal and an off-plan
 * report share the row), the body data behind target suggestions, and the
 * daily logging reminder. Writes rely on RLS for who may touch what — the
 * client writes logs/settings for themselves, the active coach and client
 * both write the body profile. */
export class NutritionLogsService {
  constructor(private db: SupabaseClient<Database>) {}

  /** Upsert on (client_id, log_date): only the intake columns are sent, so
   * an off-plan report already on that day is left alone. Macros are sent
   * as explicit nulls so clearing a field clears it. */
  async logIntake(coachId: string, clientId: string, input: LogIntakeInput): Promise<NutritionLog> {
    const { data, error } = await this.db
      .from("nutrition_logs")
      .upsert(
        {
          coach_id: coachId,
          client_id: clientId,
          log_date: input.log_date,
          kcal: input.kcal,
          protein_g: input.protein_g ?? null,
          carb_g: input.carb_g ?? null,
          fat_g: input.fat_g ?? null,
        },
        { onConflict: "client_id,log_date" }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Same upsert, touching only the off-plan columns, so an already-logged
   * kcal total survives. Flipping off_plan to true fires the coach
   * notification trigger (notify_on_off_plan). */
  async reportOffPlan(coachId: string, clientId: string, input: OffPlanInput): Promise<NutritionLog> {
    const { data, error } = await this.db
      .from("nutrition_logs")
      .upsert(
        {
          coach_id: coachId,
          client_id: clientId,
          log_date: input.log_date,
          off_plan: true,
          off_plan_meal: input.meal ?? null,
          off_plan_note: input.note ?? null,
          off_plan_kcal: input.kcal ?? null,
          off_plan_photo_path: input.photo_path ?? null,
        },
        { onConflict: "client_id,log_date" }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Inclusive ISO date range, oldest first. */
  async listLogs(clientId: string, from: string, to: string): Promise<NutritionLog[]> {
    const { data, error } = await this.db
      .from("nutrition_logs")
      .select("*")
      .eq("client_id", clientId)
      .gte("log_date", from)
      .lte("log_date", to)
      .order("log_date", { ascending: true });
    if (error) throw error;
    return data;
  }

  /** Date the client's current coaching relationship started (ISO), so
   * adherence doesn't count days before coaching began as missed. */
  async coachingStartDate(clientId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from("coaching_relationships")
      .select("started_at")
      .eq("client_id", clientId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return data?.started_at ? data.started_at.slice(0, 10) : null;
  }

  async getBodyProfile(clientId: string): Promise<BodyProfile | null> {
    const { data, error } = await this.db.from("client_body_profiles").select("*").eq("client_id", clientId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async saveBodyProfile(clientId: string, input: BodyProfileInput): Promise<BodyProfile> {
    const { data, error } = await this.db
      .from("client_body_profiles")
      .upsert({ client_id: clientId, ...input }, { onConflict: "client_id" })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Most recent check-in weight — the only place body weight is recorded. */
  async latestWeight(clientId: string): Promise<{ weight: number; date: string } | null> {
    const { data, error } = await this.db
      .from("checkins")
      .select("weight, checkin_date")
      .eq("client_id", clientId)
      .not("weight", "is", null)
      .order("checkin_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.weight != null ? { weight: data.weight, date: data.checkin_date } : null;
  }

  /** Everything the target suggestion needs, read from what's stored —
   * body profile plus the latest check-in weight — and the result. Used
   * both to render the coach's dialog and, server-side again, to decide
   * whether assigned targets are "suggested" or "suggested_edited". */
  async suggestionFor(
    clientId: string,
    today: Date
  ): Promise<{ profile: BodyProfile | null; weight: { weight: number; date: string } | null; input: SuggestInput; result: SuggestResult }> {
    const [profile, weight] = await Promise.all([this.getBodyProfile(clientId), this.latestWeight(clientId)]);
    const input: SuggestInput = {
      weightKg: weight?.weight ?? null,
      heightCm: profile?.height_cm ?? null,
      birthDate: profile?.birth_date ?? null,
      sex: (profile?.sex as Sex | null) ?? null,
      activityLevel: (profile?.activity_level as ActivityLevel | null) ?? null,
      goal: (profile?.goal as Goal | null) ?? null,
    };
    return { profile, weight, input, result: suggestMacroTargets(input, today) };
  }

  async getReminderSettings(clientId: string): Promise<ReminderSettingsRow | null> {
    const { data, error } = await this.db
      .from("nutrition_reminder_settings")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async saveReminderSettings(clientId: string, input: ReminderSettingsInput): Promise<ReminderSettingsRow> {
    const { data, error } = await this.db
      .from("nutrition_reminder_settings")
      .upsert({ client_id: clientId, ...input }, { onConflict: "client_id" })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Cron-only (needs service_role: reads every client's settings and
   * inserts notifications). Sends at most one reminder per client per local
   * day, only when that day isn't logged. The last_reminded_on claim is a
   * conditional update, so two overlapping cron runs can't both send. The
   * notification itself is delivered by the existing notifications
   * trigger + cron (push only for this kind). Returns how many were sent. */
  async sendDueReminders(now: Date): Promise<number> {
    const { data: rows, error } = await this.db
      .from("nutrition_reminder_settings")
      .select("client_id, enabled, remind_at, timezone, last_reminded_on, clients!inner(profile_id, status)")
      .eq("enabled", true)
      .eq("clients.status", "active")
      .not("clients.profile_id", "is", null);
    if (error) throw error;
    if (rows.length === 0) return 0;

    const localDates = [...new Set(rows.map((r) => safeLocalDate(now, r.timezone)).filter((d): d is string => d != null))];
    const { data: logs, error: logsError } = await this.db
      .from("nutrition_logs")
      .select("client_id, log_date")
      .in(
        "client_id",
        rows.map((r) => r.client_id)
      )
      .in("log_date", localDates);
    if (logsError) throw logsError;

    const loggedByClient = new Map<string, Set<string>>();
    for (const log of logs) {
      const set = loggedByClient.get(log.client_id) ?? new Set<string>();
      set.add(log.log_date);
      loggedByClient.set(log.client_id, set);
    }

    let sent = 0;
    for (const row of rows) {
      const date = dueReminderDate(row, now, loggedByClient.get(row.client_id) ?? new Set());
      if (!date || !row.clients.profile_id) continue;

      const { data: claimed, error: claimError } = await this.db
        .from("nutrition_reminder_settings")
        .update({ last_reminded_on: date })
        .eq("client_id", row.client_id)
        .or(`last_reminded_on.is.null,last_reminded_on.neq.${date}`)
        .select("client_id");
      if (claimError) throw claimError;
      if (claimed.length === 0) continue;

      const { error: insertError } = await this.db
        .from("notifications")
        .insert({ profile_id: row.clients.profile_id, kind: "nutrition_log_reminder", payload: { log_date: date } });
      if (insertError) throw insertError;
      sent++;
    }
    return sent;
  }
}

function safeLocalDate(now: Date, tz: string): string | null {
  try {
    return localDateTime(now, tz).date;
  } catch {
    return null;
  }
}
