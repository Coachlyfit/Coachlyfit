import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;

const HOUR = 3_600_000;

type Window = { hours: 24 | 1; column: "reminded_24h_at" | "reminded_1h_at"; from: number; to: number };

/** The two reminder windows at `now`. The 24h one stops 2h out so the 1h
 * reminder isn't preceded by a redundant "tomorrow" one for a late booking. */
export function reminderWindows(now: Date): Window[] {
  const t = now.getTime();
  return [
    { hours: 24, column: "reminded_24h_at", from: t + 2 * HOUR, to: t + 24 * HOUR },
    { hours: 1, column: "reminded_1h_at", from: t, to: t + HOUR },
  ];
}

/** A session booked inside the window already got its confirmation; reminding
 * about it minutes later is noise. */
export function bookedBeforeWindow(createdAt: string, startsAt: string, hours: number): boolean {
  return new Date(startsAt).getTime() - new Date(createdAt).getTime() >= hours * HOUR;
}

type Candidate = {
  id: string;
  starts_at: string;
  created_at: string;
  type: string;
  client: { display_name: string; profile_id: string | null; assigned_to: string | null } | null;
  coach: { business_name: string } | null;
  coach_id: string;
};

/** Queue "session in 24h / 1h" notifications. Needs the service role: it writes
 * notifications for other people, and the reminded_* columns are guarded
 * against everyone else. Safe to run overlapping or twice: the claim UPDATE
 * only returns rows it flipped from null, and only those get a notification. */
export class AppointmentReminders {
  constructor(private db: Db) {}

  async sendDue(now: Date): Promise<number> {
    let sent = 0;
    for (const w of reminderWindows(now)) {
      const { data: candidates, error } = await this.db
        .from("appointments")
        .select("id, starts_at, created_at, type, coach_id, client:clients(display_name, profile_id, assigned_to), coach:coaches(business_name)")
        .eq("status", "confirmed")
        .is(w.column, null)
        .gt("starts_at", new Date(w.from).toISOString())
        .lte("starts_at", new Date(w.to).toISOString())
        .limit(200);
      if (error) throw error;
      if (!candidates || candidates.length === 0) continue;

      const { data: claimed, error: claimError } = await this.db
        .from("appointments")
        .update(w.column === "reminded_24h_at" ? { reminded_24h_at: now.toISOString() } : { reminded_1h_at: now.toISOString() })
        .in("id", candidates.map((c) => c.id))
        .is(w.column, null)
        .select("id");
      if (claimError) throw claimError;
      const won = new Set((claimed ?? []).map((c) => c.id));

      const rows: Database["public"]["Tables"]["notifications"]["Insert"][] = [];
      for (const c of candidates as unknown as Candidate[]) {
        if (!won.has(c.id) || !bookedBeforeWindow(c.created_at, c.starts_at, w.hours)) continue;
        const base = { appointment_id: c.id, starts_at: c.starts_at, type: c.type, hours: w.hours };
        const coachSide = [...new Set([c.coach_id, c.client?.assigned_to].filter((x): x is string => !!x))];
        for (const profileId of coachSide) {
          rows.push({
            profile_id: profileId,
            kind: "appointment_reminder",
            payload: { ...base, name: c.client?.display_name ?? null, audience: "coach" },
          });
        }
        if (c.client?.profile_id) {
          rows.push({
            profile_id: c.client.profile_id,
            kind: "appointment_reminder",
            payload: { ...base, name: c.coach?.business_name ?? null, audience: "client" },
          });
        }
      }
      if (rows.length > 0) {
        const { error: insertError } = await this.db.from("notifications").insert(rows);
        if (insertError) throw insertError;
        sent += rows.length;
      }
    }
    return sent;
  }
}
