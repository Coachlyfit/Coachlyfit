// Google Calendar sync tables and functions (20261123000002 .. 000004):
//   * the refresh token is never readable by a user session, only the owner
//     sees the rest of their connection row
//   * queue / watch / busy tables are service_role only
//   * google_connect / google_disconnect act on the caller's own row, owner only
//   * the webhook ping only answers for a channel id + token we issued
//   * Google busy time blocks booking slots for clients, without exposing details
//   * appointments' google_* and proposed_* columns can't be set by a user
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

type Fixture = { userId: string; client: SupabaseClient<Database> };

const HOUR = 3_600_000;
function slot(days: number, offsetHours = 0) {
  const base = Math.ceil((Date.now() + days * 24 * HOUR) / HOUR) * HOUR + offsetHours * HOUR;
  return { starts_at: new Date(base).toISOString(), ends_at: new Date(base + HOUR).toISOString() };
}

let coachA: Fixture;
let coachB: Fixture;
let clientA: Fixture & { id: string };

const connectArgs = {
  p_encrypted_refresh_token: "v1.aaaa.bbbb.cccc",
  p_calendar_id: "cal-1@group.calendar.google.com",
  p_email: "coach@example.com",
  p_scopes: ["https://www.googleapis.com/auth/calendar.app.created"],
};

beforeAll(async () => {
  [coachA, coachB] = await Promise.all(
    ["a", "b"].map((tag) => createRlsUser(`gsync-coach-${tag}`, { role: "coach", full_name: `Coach ${tag}`, business_name: `${tag} Fitness`, locale: "en" }))
  );
  const user = await createRlsUser("gsync-client-a", { role: "client", full_name: "Client a", locale: "en" });
  const { data, error } = await admin
    .from("clients")
    .insert({ coach_id: coachA.userId, profile_id: user.userId, display_name: "Client a" })
    .select("id")
    .single();
  if (error) throw error;
  clientA = { ...user, id: data.id as string };
}, 60_000);

describe("google_connect / google_disconnect", () => {
  it("the owner connects; the token is stored but never readable by any user session", async () => {
    const { error } = await coachA.client.rpc("google_connect", connectArgs);
    expect(error).toBeNull();

    // Non-secret columns: the owner reads their own row.
    const own = await coachA.client.from("google_connections").select("calendar_id, google_email, status").single();
    expect(own.data).toEqual({ calendar_id: connectArgs.p_calendar_id, google_email: "coach@example.com", status: "active" });

    // The token column: refused outright, for the owner too.
    const token = await coachA.client.from("google_connections").select("encrypted_refresh_token");
    expect(token.error).not.toBeNull();
    const star = await coachA.client.from("google_connections").select("*");
    expect(star.error).not.toBeNull();

    // Another coach and the client see nothing.
    expect((await coachB.client.from("google_connections").select("status")).data).toEqual([]);
    expect((await clientA.client.from("google_connections").select("status")).data).toEqual([]);
  });

  it("users cannot write the table directly", async () => {
    const insert = await coachB.client
      .from("google_connections")
      .insert({ coach_id: coachB.userId, encrypted_refresh_token: "x", calendar_id: "y" });
    expect(insert.error).not.toBeNull();
    const update = await coachA.client.from("google_connections").update({ status: "revoked" }).eq("coach_id", coachA.userId).select("id");
    expect(update.error ?? update.data?.length === 0).toBeTruthy();
  });

  it("a client cannot connect or disconnect anything", async () => {
    expect((await clientA.client.rpc("google_connect", connectArgs)).error?.code).toBe("42501");
    expect((await clientA.client.rpc("google_disconnect")).error?.code).toBe("42501");
  });

  it("a Starter coach is refused (no scheduling on the plan)", async () => {
    const starter = await createRlsUser("gsync-starter", { role: "coach", full_name: "Starter", business_name: "S Fitness", locale: "en" });
    const { data: tier } = await admin.from("subscription_tiers").select("id").eq("key", "starter").single();
    await admin.from("subscriptions").update({ tier_id: tier!.id }).eq("coach_id", starter.userId);
    const { error } = await starter.client.rpc("google_connect", connectArgs);
    expect(error?.hint).toBe("upgrade_required");
  });

  it("disconnect returns the stored token for the server to revoke, then removes the row", async () => {
    const coach = await createRlsUser("gsync-disc", { role: "coach", full_name: "Disc", business_name: "D Fitness", locale: "en" });
    await coach.client.rpc("google_connect", connectArgs);

    const first = await coach.client.rpc("google_disconnect");
    expect(first.error).toBeNull();
    expect(first.data).toEqual([{ token: connectArgs.p_encrypted_refresh_token, calendar: connectArgs.p_calendar_id, channel_id: null, resource_id: null }]);
    expect((await coach.client.from("google_connections").select("status")).data).toEqual([]);

    // Nothing left to disconnect: an empty result, not an error.
    expect((await coach.client.rpc("google_disconnect")).data).toEqual([]);
  });

  it("reconnecting replaces the connection and clears the old watch channel", async () => {
    const coach = await createRlsUser("gsync-reconn", { role: "coach", full_name: "Re", business_name: "R Fitness", locale: "en" });
    await coach.client.rpc("google_connect", connectArgs);
    const { data: conn } = await admin.from("google_connections").select("id").eq("coach_id", coach.userId).single();
    await admin
      .from("google_watch_channels")
      .insert({ connection_id: conn!.id, channel_id: "old-channel", resource_id: "r", channel_token: "t".repeat(32), expires_at: new Date(Date.now() + 5 * 24 * HOUR).toISOString(), sync_token: "stale" });

    const { data: previous } = await coach.client.rpc("google_connect", { ...connectArgs, p_calendar_id: "cal-2" });
    expect(previous).toBe(connectArgs.p_calendar_id);
    const channels = await admin.from("google_watch_channels").select("channel_id").eq("connection_id", conn!.id);
    expect(channels.data).toEqual([]);
  });
});

describe("service-role-only tables", () => {
  it("queue, watch and busy tables are invisible and unwritable to users", async () => {
    for (const table of ["google_sync_jobs", "google_watch_channels", "google_busy_blocks"] as const) {
      const read = await coachA.client.from(table).select("*");
      expect(read.error !== null || (read.data ?? []).length === 0).toBe(true);
    }
    const write = await coachA.client.from("google_busy_blocks").insert({ coach_id: coachA.userId, ...slot(5) });
    expect(write.error).not.toBeNull();
    expect((await coachA.client.rpc("replace_google_busy", { p_coach_id: coachA.userId, p_blocks: [] })).error).not.toBeNull();
    expect((await coachA.client.rpc("claim_google_sync_jobs", { p_limit: 5 })).error).not.toBeNull();
  });
});

describe("webhook ping", () => {
  it("answers true and marks the channel dirty only for the right id + token", async () => {
    const { data: conn } = await admin.from("google_connections").select("id").eq("coach_id", coachA.userId).single();
    const token = "secret-".repeat(6);
    await admin
      .from("google_watch_channels")
      .insert({ connection_id: conn!.id, channel_id: "chan-ping", resource_id: "r", channel_token: token, expires_at: new Date(Date.now() + 5 * 24 * HOUR).toISOString() });

    const wrong = await clientA.client.rpc("google_webhook_ping", { p_channel_id: "chan-ping", p_token: "nope" });
    expect(wrong.data).toBe(false);
    const unknown = await clientA.client.rpc("google_webhook_ping", { p_channel_id: "chan-missing", p_token: token });
    expect(unknown.data).toBe(false);
    expect((await admin.from("google_watch_channels").select("dirty_at").eq("channel_id", "chan-ping").single()).data?.dirty_at).toBeNull();

    const ok = await clientA.client.rpc("google_webhook_ping", { p_channel_id: "chan-ping", p_token: token });
    expect(ok.data).toBe(true);
    expect((await admin.from("google_watch_channels").select("dirty_at").eq("channel_id", "chan-ping").single()).data?.dirty_at).not.toBeNull();
  });
});

describe("Google busy time and slots", () => {
  it("a client sees the coach's Google busy block as a busy range, with nothing else", async () => {
    const block = slot(9);
    await admin.rpc("replace_google_busy", { p_coach_id: coachA.userId, p_blocks: [{ starts_at: block.starts_at, ends_at: block.ends_at }] });

    const busy = await clientA.client.rpc("coach_busy_ranges", {
      p_from: new Date(Date.now()).toISOString(),
      p_to: new Date(Date.now() + 30 * 24 * HOUR).toISOString(),
    });
    expect(busy.error).toBeNull();
    expect(busy.data?.some((r) => new Date(r.starts_at).getTime() === new Date(block.starts_at).getTime())).toBe(true);
    expect(Object.keys(busy.data![0]).sort()).toEqual(["ends_at", "starts_at"]);

    // Another coach's clients don't see it.
    const other = await coachB.client.rpc("coach_busy_ranges", { p_from: new Date().toISOString(), p_to: new Date(Date.now() + 30 * 24 * HOUR).toISOString() });
    expect(other.data ?? []).toEqual([]);
  });
});

describe("sync state, retry and protected columns", () => {
  it("shows pending for a freshly booked session, lets the coach retry, and refuses other coaches", async () => {
    const { data: appt, error } = await coachA.client
      .from("appointments")
      .insert({ coach_id: coachA.userId, client_id: clientA.id, type: "online", status: "confirmed", ...slot(11) })
      .select("id")
      .single();
    expect(error).toBeNull();

    const state = await coachA.client.rpc("appointment_sync_status", { p_ids: [appt!.id] });
    expect(state.data).toEqual([{ appointment_id: appt!.id, state: "pending" }]);

    // A dead job reads as failed until retried.
    await admin.from("google_sync_jobs").update({ status: "dead" }).eq("appointment_id", appt!.id);
    expect((await coachA.client.rpc("appointment_sync_status", { p_ids: [appt!.id] })).data).toEqual([{ appointment_id: appt!.id, state: "failed" }]);
    expect((await coachA.client.rpc("retry_google_sync", { p_appointment_id: appt!.id })).data).toBe(true);
    expect((await coachA.client.rpc("appointment_sync_status", { p_ids: [appt!.id] })).data).toEqual([{ appointment_id: appt!.id, state: "pending" }]);

    // Not their appointment: nothing about it, and no retry.
    expect((await coachB.client.rpc("appointment_sync_status", { p_ids: [appt!.id] })).data).toEqual([]);
    expect((await coachB.client.rpc("retry_google_sync", { p_appointment_id: appt!.id })).error?.code).toBe("42501");
  });

  it("a user cannot set the Google or proposed-time columns", async () => {
    const { data: appt } = await coachA.client
      .from("appointments")
      .insert({ coach_id: coachA.userId, client_id: clientA.id, type: "online", status: "confirmed", ...slot(12) })
      .select("id")
      .single();

    const update = await coachA.client
      .from("appointments")
      .update({ google_event_id: "forged", google_etag: "x", proposed_starts_at: new Date().toISOString() })
      .eq("id", appt!.id);
    expect(update.error).toBeNull();

    const row = await admin.from("appointments").select("google_event_id, google_etag, proposed_starts_at").eq("id", appt!.id).single();
    expect(row.data).toEqual({ google_event_id: null, google_etag: null, proposed_starts_at: null });
  });

  it("the service role can set them (the sync worker does)", async () => {
    const { data: appt } = await coachA.client
      .from("appointments")
      .insert({ coach_id: coachA.userId, client_id: clientA.id, type: "online", status: "confirmed", ...slot(13) })
      .select("id")
      .single();
    const proposed = new Date(Date.now() + 14 * 24 * HOUR).toISOString();
    await admin.from("appointments").update({ google_event_id: "ev", proposed_starts_at: proposed }).eq("id", appt!.id);
    const row = await admin.from("appointments").select("google_event_id, proposed_starts_at").eq("id", appt!.id).single();
    expect(row.data?.google_event_id).toBe("ev");
    expect(new Date(row.data!.proposed_starts_at!).getTime()).toBe(new Date(proposed).getTime());
  });
});
