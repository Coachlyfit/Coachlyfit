import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { EventsApi } from "@/lib/google/events-api";
import type { AppLocale } from "@/domain/locale";
import { markNeedsReconnect, needsReconnect } from "./connection-state";
import { buildEvent } from "./event";
import { reconcile } from "./reconcile";
import { describeError, nextSyncOutcome } from "./sync-jobs";

type Db = SupabaseClient<Database>;
type Job = Database["public"]["Tables"]["google_sync_jobs"]["Row"];

export type SyncCounts = { done: number; retried: number; dead: number; paused: number };

/** Pushes queued appointment changes to coaches' "Coachly Fit" Google
 * calendars. Runs with the service role (the queue and the tokens have no user
 * policies). Coachly stays the source of truth: nothing here can fail or block
 * an appointment write; a Google problem only delays or marks a job.
 *
 * `apiFor` returns an events client for a coach (refreshing the access token),
 * and throws a GoogleApiError(invalid_grant) when the coach's grant is gone. */
export class GoogleSyncService {
  private apis = new Map<string, Promise<EventsApi>>();
  private locales = new Map<string, AppLocale>();

  constructor(
    private db: Db,
    private apiFor: (coachId: string) => Promise<EventsApi>,
    private now: () => Date = () => new Date(),
    private random: () => number = Math.random
  ) {}

  async run(limit = 25): Promise<SyncCounts> {
    const counts: SyncCounts = { done: 0, retried: 0, dead: 0, paused: 0 };
    const { data: jobs, error } = await this.db.rpc("claim_google_sync_jobs", { p_limit: limit });
    if (error) throw error;

    const paused = new Set<string>();
    const touched = new Set<string>();
    for (const job of jobs ?? []) {
      // The coach's grant already failed this run: leave the rest for later.
      if (paused.has(job.coach_id)) {
        await this.requeue(job, { attempts: job.attempts });
        counts.paused++;
        continue;
      }
      try {
        await this.process(job);
        touched.add(job.coach_id);
        counts.done++;
      } catch (error) {
        if (needsReconnect(error)) {
          paused.add(job.coach_id);
          await markNeedsReconnect(this.db, job.coach_id);
          await this.requeue(job, { attempts: job.attempts });
          counts.paused++;
          continue;
        }
        const attempts = job.attempts + 1;
        const outcome = nextSyncOutcome(attempts, this.now(), error, this.random);
        if (outcome.status === "dead") {
          await this.db
            .from("google_sync_jobs")
            .update({ status: "dead", attempts, last_error: describeError(error), locked_at: null })
            .eq("id", job.id);
          counts.dead++;
        } else {
          await this.requeue(job, {
            attempts,
            last_error: describeError(error),
            next_attempt_at: outcome.nextAttemptAt.toISOString(),
          });
          counts.retried++;
        }
      }
    }

    for (const coachId of touched) {
      await this.db.from("google_connections").update({ last_sync_at: this.now().toISOString() }).eq("coach_id", coachId);
    }
    return counts;
  }

  private async process(job: Job): Promise<void> {
    const { data: appointment, error } = await this.db
      .from("appointments")
      .select("id, status, starts_at, ends_at, type, location_or_link, google_event_id, client:clients(display_name)")
      .eq("id", job.appointment_id)
      .maybeSingle();
    if (error) throw error;

    // Deleted meanwhile (client removed): nothing to sync, nothing to retry.
    if (!appointment) {
      await this.db.from("google_sync_jobs").update({ status: "done", locked_at: null }).eq("id", job.id);
      return;
    }

    const event = buildEvent(appointment, {
      clientName: appointment.client?.display_name ?? null,
      locale: await this.localeOf(job.coach_id),
    });
    const result = await reconcile(appointment, event, await this.api(job.coach_id));

    const { error: updateError } = await this.db
      .from("appointments")
      .update({ google_event_id: result.eventId, google_etag: result.etag, last_synced_at: this.now().toISOString() })
      .eq("id", appointment.id);
    if (updateError) throw updateError;

    await this.db.from("google_sync_jobs").update({ status: "done", locked_at: null, last_error: null }).eq("id", job.id);
  }

  private api(coachId: string): Promise<EventsApi> {
    let api = this.apis.get(coachId);
    if (!api) {
      api = this.apiFor(coachId);
      this.apis.set(coachId, api);
    }
    return api;
  }

  private async localeOf(coachId: string): Promise<AppLocale> {
    const cached = this.locales.get(coachId);
    if (cached) return cached;
    const { data } = await this.db.from("profiles").select("locale").eq("id", coachId).maybeSingle();
    const locale: AppLocale = data?.locale === "en" ? "en" : "ar";
    this.locales.set(coachId, locale);
    return locale;
  }

  /** Back to pending. If a newer pending job for the same appointment queued up
   * while this one ran, that one will sync the current state: drop this one. */
  private async requeue(job: Job, patch: { attempts: number; last_error?: string; next_attempt_at?: string }): Promise<void> {
    const { error } = await this.db
      .from("google_sync_jobs")
      .update({ status: "pending", locked_at: null, ...patch })
      .eq("id", job.id);
    if (error?.code === "23505") await this.db.from("google_sync_jobs").delete().eq("id", job.id);
    else if (error) throw error;
  }
}
