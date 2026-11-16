import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { GoogleApiError } from "@/lib/google/errors";
import { listEvents, type RemoteEvent } from "@/lib/google/events-api";
import type { AccessProvider } from "./access";
import { markNeedsReconnect, needsReconnect } from "./connection-state";
import { detectChanges, detectMissing, type Change, type PullAppointment } from "./pull";

type Db = SupabaseClient<Database>;

export type PullCounts = { channels: number; moved: number; deleted: number; resynced: number; failed: number };

/** Sentinel in appointments.cancel_reason: the UI shows it translated. */
export const REMOVED_IN_GOOGLE = "google_removed";

const LIVE = ["requested", "confirmed"];
const SELECT = "id, coach_id, status, starts_at, ends_at, google_event_id, google_etag";

/** Pulls changes the coach made to the "Coachly Fit" calendar in Google back
 * into Coachly. Coachly stays the source of truth, so Google never edits an
 * appointment directly:
 *   - an event deleted in Google cancels the appointment;
 *   - an event moved in Google becomes a reschedule *request* carrying the
 *     proposed time, which the coach accepts or ignores.
 * Both notify the client and the coach.
 *
 * Runs after a webhook marked the channel dirty. Uses the calendar's
 * incremental sync token; when Google says it expired (410) it does a full
 * resync and diffs against what we have. Service-role client (cron path). */
export class GooglePullService {
  constructor(
    private db: Db,
    private accessFor: AccessProvider,
    private now: () => Date = () => new Date(),
    private list: typeof listEvents = listEvents
  ) {}

  async run(): Promise<PullCounts> {
    const counts: PullCounts = { channels: 0, moved: 0, deleted: 0, resynced: 0, failed: 0 };
    const { data: channels, error } = await this.db
      .from("google_watch_channels")
      .select("id, sync_token, dirty_at, google_connections!inner(coach_id, status)")
      .not("dirty_at", "is", null)
      .eq("google_connections.status", "active");
    if (error) throw error;

    for (const channel of channels ?? []) {
      const connection = Array.isArray(channel.google_connections) ? channel.google_connections[0] : channel.google_connections;
      if (!connection) continue;
      try {
        await this.processChannel(channel, connection.coach_id, counts);
        counts.channels++;
      } catch (error) {
        counts.failed++;
        if (needsReconnect(error)) await markNeedsReconnect(this.db, connection.coach_id);
        // Anything else: the channel stays dirty and the next run tries again.
      }
    }
    return counts;
  }

  private async processChannel(
    channel: { id: string; sync_token: string | null; dirty_at: string | null },
    coachId: string,
    counts: PullCounts
  ): Promise<void> {
    const access = await this.accessFor(coachId);

    let syncToken = channel.sync_token;
    let recovered = false;
    let events: RemoteEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    for (;;) {
      let page;
      try {
        page = await this.list(access.accessToken, access.calendarId, { syncToken, pageToken });
      } catch (error) {
        // 410: the sync token expired. Forget it and list everything again.
        if (error instanceof GoogleApiError && error.status === 410 && syncToken) {
          syncToken = null;
          recovered = true;
          events = [];
          pageToken = undefined;
          continue;
        }
        throw error;
      }
      events.push(...page.items);
      if (page.nextPageToken) {
        pageToken = page.nextPageToken;
        continue;
      }
      nextSyncToken = page.nextSyncToken;
      break;
    }
    if (recovered) counts.resynced++;

    // The very first pass over a new channel only records where we are: the
    // events may not even exist yet, so "missing" would mean nothing.
    const baseline = !channel.sync_token && !recovered;
    if (!baseline) {
      const changes = await this.changesFor(coachId, events, recovered);
      await this.apply(coachId, changes, counts);
    }

    // Save the token first, then clear "dirty" only if no newer webhook arrived meanwhile.
    await this.db
      .from("google_watch_channels")
      .update({ sync_token: nextSyncToken ?? channel.sync_token ?? null })
      .eq("id", channel.id);
    if (channel.dirty_at) {
      await this.db.from("google_watch_channels").update({ dirty_at: null }).eq("id", channel.id).eq("dirty_at", channel.dirty_at);
    }
  }

  private async changesFor(coachId: string, events: RemoteEvent[], fullListing: boolean): Promise<Change[]> {
    const ids = [
      ...new Set(events.map((e) => e.extendedProperties?.private?.coachlyAppointmentId).filter((id): id is string => !!id)),
    ];

    // A delta that mentions none of our events can't contain a change.
    if (!fullListing && ids.length === 0) return [];

    const live = this.db.from("appointments").select(SELECT).eq("coach_id", coachId).in("status", LIVE);
    // A full listing is compared against everything already synced; a delta
    // only needs the appointments it mentions.
    const [{ data: rows, error }, { data: jobs }] = await Promise.all([
      fullListing ? live.not("google_event_id", "is", null).limit(2000) : live.in("id", ids),
      this.db.from("google_sync_jobs").select("appointment_id").eq("coach_id", coachId).in("status", ["pending", "processing"]),
    ]);
    if (error) throw error;

    const appointments: PullAppointment[] = rows ?? [];
    const pending = new Set((jobs ?? []).map((j) => j.appointment_id));
    const changes = detectChanges(events, {
      coachId,
      appointments: new Map(appointments.map((a) => [a.id, a])),
      pending,
    });
    if (fullListing) {
      const found = new Set(changes.map((c) => c.appointmentId));
      changes.push(
        ...detectMissing(new Set(events.map((e) => e.id)), appointments, { pending, now: this.now() }).filter((c) => !found.has(c.appointmentId))
      );
    }
    return changes;
  }

  private async apply(coachId: string, changes: Change[], counts: PullCounts): Promise<void> {
    if (changes.length === 0) return;
    const { data: details } = await this.db
      .from("appointments")
      .select("id, starts_at, type, client:clients(display_name, profile_id, assigned_to), coach:coaches(business_name)")
      .in("id", changes.map((c) => c.appointmentId));
    const info = new Map((details ?? []).map((d) => [d.id, d]));
    const nowIso = this.now().toISOString();

    for (const change of changes) {
      const detail = info.get(change.appointmentId);
      const base = detail ? { appointment_id: detail.id, type: detail.type } : null;

      if (change.kind === "deleted") {
        const { data } = await this.db
          .from("appointments")
          .update({ status: "cancelled", cancel_reason: REMOVED_IN_GOOGLE })
          .eq("id", change.appointmentId)
          .in("status", LIVE)
          .select("id");
        if ((data?.length ?? 0) === 0 || !detail || !base) continue;
        counts.deleted++;
        // The database trigger tells the client; the coach did this in Google, so tell them it landed.
        const recipients = [...new Set([coachId, detail.client?.assigned_to].filter((id): id is string => !!id))];
        await this.db.from("notifications").insert(
          recipients.map((profile_id) => ({
            profile_id,
            kind: "appointment_cancelled",
            payload: { ...base, starts_at: detail.starts_at, name: detail.client?.display_name ?? null, audience: "coach" },
          }))
        );
        continue;
      }

      // Moved. Only the first request notifies (the trigger tells the coach side).
      const proposal = { proposed_starts_at: change.startsAt, proposed_ends_at: change.endsAt };
      const { data: first } = await this.db
        .from("appointments")
        .update({ reschedule_requested_at: nowIso, ...proposal })
        .eq("id", change.appointmentId)
        .in("status", LIVE)
        .is("reschedule_requested_at", null)
        .select("id");
      if ((first?.length ?? 0) > 0) {
        counts.moved++;
        if (detail?.client?.profile_id && base) {
          await this.db.from("notifications").insert({
            profile_id: detail.client.profile_id,
            kind: "appointment_reschedule_proposed",
            payload: { ...base, starts_at: change.startsAt, name: detail.coach?.business_name ?? null, audience: "client" },
          });
        }
      } else {
        await this.db
          .from("appointments")
          .update(proposal)
          .eq("id", change.appointmentId)
          .in("status", LIVE)
          .not("reschedule_requested_at", "is", null);
      }
    }
  }
}
