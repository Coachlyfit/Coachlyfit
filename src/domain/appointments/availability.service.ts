import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DEFAULT_TIME_ZONE, addDays } from "./tz";
import { generateSlots, type AvailabilityRule, type AvailabilityException, type Interval } from "./slots";
import type { ExceptionInput, SettingsInput } from "./schemas";

type Db = SupabaseClient<Database>;

export const DEFAULT_SETTINGS: SettingsInput = { cancel_cutoff_hours: 12, slot_minutes: 60, min_notice_hours: 2 };

export type AvailabilityRow = AvailabilityRule & { id: string };
export type ExceptionRow = AvailabilityException & { id: string };

export class AvailabilityService {
  constructor(private db: Db) {}

  async rules(coachId: string): Promise<AvailabilityRow[]> {
    const { data, error } = await this.db
      .from("coach_availability")
      .select("id, weekday, start_time, end_time, timezone")
      .eq("coach_id", coachId)
      .order("weekday")
      .order("start_time");
    if (error) throw error;
    return data ?? [];
  }

  /** Days off and custom-hours days from `fromDate` (YYYY-MM-DD) on. */
  async exceptions(coachId: string, fromDate: string): Promise<ExceptionRow[]> {
    const { data, error } = await this.db
      .from("coach_availability_exceptions")
      .select("id, date, is_off, start_time, end_time")
      .eq("coach_id", coachId)
      .gte("date", fromDate)
      .order("date");
    if (error) throw error;
    return data ?? [];
  }

  async settings(coachId: string): Promise<SettingsInput> {
    const { data, error } = await this.db
      .from("coach_appointment_settings")
      .select("cancel_cutoff_hours, slot_minutes, min_notice_hours")
      .eq("coach_id", coachId)
      .maybeSingle();
    if (error) throw error;
    return data ?? DEFAULT_SETTINGS;
  }

  /** Bookable slots in [from, to): the coach's hours minus what is already
   * booked (requested + confirmed, via the busy-ranges RPC so a client never
   * reads other clients' appointments). `extraBusy` is where Google freebusy
   * will plug in. */
  async freeSlots(
    coachId: string,
    from: Date,
    to: Date,
    opts: { now?: Date; extraBusy?: Interval[] } = {}
  ): Promise<{ slots: Interval[]; settings: SettingsInput }> {
    const [rules, settings, busyRows] = await Promise.all([
      this.rules(coachId),
      this.settings(coachId),
      this.db.rpc("coach_busy_ranges", { p_from: from.toISOString(), p_to: to.toISOString() }),
    ]);
    if (busyRows.error) throw busyRows.error;
    const exceptions = await this.exceptions(coachId, addDays(from.toISOString().slice(0, 10), -1));

    const slots = generateSlots({
      rules,
      exceptions,
      busy: (busyRows.data ?? []).map((r) => ({ start: new Date(r.starts_at), end: new Date(r.ends_at) })),
      extraBusy: opts.extraBusy,
      from,
      to,
      slotMinutes: settings.slot_minutes,
      minNoticeHours: settings.min_notice_hours,
      now: opts.now ?? new Date(),
    });
    return { slots, settings };
  }

  async saveSettings(coachId: string, settings: SettingsInput): Promise<void> {
    const { error } = await this.db
      .from("coach_appointment_settings")
      .upsert({ coach_id: coachId, ...settings, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  /** Replace the weekly hours. New rows go in before the old ones are removed,
   * so a failure part-way leaves duplicates (harmless: slots are de-duplicated)
   * instead of an empty week. */
  async replaceRules(
    coachId: string,
    timezone: string,
    rules: { weekday: number; start_time: string; end_time: string }[]
  ): Promise<void> {
    const { data: old, error: readError } = await this.db.from("coach_availability").select("id").eq("coach_id", coachId);
    if (readError) throw readError;

    if (rules.length > 0) {
      const { error } = await this.db
        .from("coach_availability")
        .insert(rules.map((r) => ({ coach_id: coachId, timezone: timezone || DEFAULT_TIME_ZONE, ...r })));
      if (error) throw error;
    }

    const oldIds = (old ?? []).map((r) => r.id);
    if (oldIds.length > 0) {
      const { error } = await this.db.from("coach_availability").delete().in("id", oldIds);
      if (error) throw error;
    }
  }

  async saveException(coachId: string, input: ExceptionInput): Promise<void> {
    const { error } = await this.db
      .from("coach_availability_exceptions")
      .upsert({ coach_id: coachId, ...input }, { onConflict: "coach_id,date" });
    if (error) throw error;
  }

  async removeException(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("coach_availability_exceptions").delete().eq("id", id).select("id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }
}
