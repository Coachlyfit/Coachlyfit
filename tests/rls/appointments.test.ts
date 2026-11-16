// appointments: coach <-> client 1:1 sessions. Rules proved here:
//   * tenant isolation (another coach sees and writes nothing)
//   * a client creates only "requested" rows for their own coach, and may only
//     cancel / ask to reschedule, within the coach's cutoff
//   * no double-booking for a coach or a client (exclusion constraints)
//   * the plan flag (Starter = no scheduling) and a lapsed subscription
//   * admin is read-only
// Team-member assignment rides the same accessible_client_ids() helper the
// other assignment tests cover (client_assignment), so it isn't repeated.
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

type Fixture = { userId: string; client: SupabaseClient<Database> };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A whole-hour slot `days` from now, `hour` hours long offset by `offsetHours`. */
function slot(days: number, offsetHours = 0, lengthHours = 1) {
  const base = Math.ceil((Date.now() + days * DAY) / HOUR) * HOUR + offsetHours * HOUR;
  return { starts_at: new Date(base).toISOString(), ends_at: new Date(base + lengthHours * HOUR).toISOString() };
}

let coachA: Fixture;
let coachB: Fixture;
let adminUser: Fixture;
let clientA1: Fixture & { id: string };
let clientA2: Fixture & { id: string };

async function createCoach(tag: string) {
  return createRlsUser(`appt-coach-${tag}`, { role: "coach", full_name: `Coach ${tag}`, business_name: `${tag} Fitness`, locale: "en" });
}

async function createClientRow(coach: Fixture, tag: string) {
  const user = await createRlsUser(`appt-client-${tag}`, { role: "client", full_name: `Client ${tag}`, locale: "en" });
  const { data, error } = await admin
    .from("clients")
    .insert({ coach_id: coach.userId, profile_id: user.userId, display_name: `Client ${tag}` })
    .select("id")
    .single();
  if (error) throw error;
  return { ...user, id: data.id as string };
}

beforeAll(async () => {
  [coachA, coachB] = await Promise.all([createCoach("a"), createCoach("b")]);
  adminUser = await createRlsUser("appt-admin", { role: "admin", full_name: "Admin", locale: "en" });
  [clientA1, clientA2] = await Promise.all([createClientRow(coachA, "a1"), createClientRow(coachA, "a2")]);
}, 60_000);

async function coachBooks(range: { starts_at: string; ends_at: string }, client = clientA1, status: "requested" | "confirmed" = "confirmed") {
  return coachA.client
    .from("appointments")
    .insert({ coach_id: coachA.userId, client_id: client.id, type: "online", status, ...range })
    .select("id")
    .single();
}

describe("coach side", () => {
  it("books a confirmed session; the client sees it, another coach does not", async () => {
    const { data, error } = await coachBooks(slot(3));
    expect(error).toBeNull();

    const own = await clientA1.client.from("appointments").select("id").eq("id", data!.id);
    expect(own.data).toHaveLength(1);
    const other = await coachB.client.from("appointments").select("id").eq("id", data!.id);
    expect(other.data).toEqual([]);
    const otherClient = await clientA2.client.from("appointments").select("id").eq("id", data!.id);
    expect(otherClient.data).toEqual([]);
  });

  it("another coach cannot book for this coach's client", async () => {
    const { error } = await coachB.client
      .from("appointments")
      .insert({ coach_id: coachB.userId, client_id: clientA1.id, type: "online", status: "confirmed", ...slot(4) });
    expect(error).not.toBeNull();
  });

  it("refuses a status other than requested/confirmed on creation", async () => {
    const { error } = await coachA.client
      .from("appointments")
      .insert({ coach_id: coachA.userId, client_id: clientA1.id, type: "online", status: "completed", ...slot(5) });
    expect(error?.code).toBe("23514");
  });
});

describe("double-booking", () => {
  it("rejects an overlapping session for the same coach, even for another client", async () => {
    const range = slot(6);
    expect((await coachBooks(range, clientA1)).error).toBeNull();
    const clash = await coachBooks(range, clientA2);
    expect(clash.error?.code).toBe("23P01");
    expect(clash.error?.message).toContain("appointments_no_coach_overlap");
  });

  it("allows back-to-back sessions", async () => {
    const first = slot(7);
    const next = slot(7, 1);
    expect((await coachBooks(first, clientA1)).error).toBeNull();
    expect((await coachBooks(next, clientA2)).error).toBeNull();
  });

  it("a cancelled session frees its slot", async () => {
    const range = slot(8);
    const { data } = await coachBooks(range, clientA1);
    const cancel = await coachA.client.from("appointments").update({ status: "cancelled" }).eq("id", data!.id);
    expect(cancel.error).toBeNull();
    expect((await coachBooks(range, clientA2)).error).toBeNull();
  });

  it("a pending request holds its slot", async () => {
    const range = slot(9);
    expect((await coachBooks(range, clientA1, "requested")).error).toBeNull();
    expect((await coachBooks(range, clientA2)).error?.code).toBe("23P01");
  });
});

describe("status transitions", () => {
  it("allows requested -> confirmed and refuses jumps", async () => {
    const { data } = await coachBooks(slot(10), clientA1, "requested");
    const skip = await coachA.client.from("appointments").update({ status: "completed" }).eq("id", data!.id);
    expect(skip.error?.hint).toBe("invalid_transition");
    const ok = await coachA.client.from("appointments").update({ status: "confirmed" }).eq("id", data!.id);
    expect(ok.error).toBeNull();
  });

  it("cannot mark a future session completed", async () => {
    const { data } = await coachBooks(slot(11));
    const early = await coachA.client.from("appointments").update({ status: "completed" }).eq("id", data!.id);
    expect(early.error?.hint).toBe("not_started");
  });
});

describe("client side", () => {
  it("requests a session for their own coach", async () => {
    const { error } = await clientA1.client
      .from("appointments")
      .insert({ coach_id: coachA.userId, client_id: clientA1.id, type: "online", status: "requested", ...slot(12) });
    expect(error).toBeNull();
  });

  it("cannot create a confirmed session, or one for another client or coach", async () => {
    const range = slot(13);
    const confirmed = await clientA1.client
      .from("appointments")
      .insert({ coach_id: coachA.userId, client_id: clientA1.id, type: "online", status: "confirmed", ...range });
    expect(confirmed.error).not.toBeNull();

    const asOther = await clientA1.client
      .from("appointments")
      .insert({ coach_id: coachA.userId, client_id: clientA2.id, type: "online", status: "requested", ...range });
    expect(asOther.error).not.toBeNull();

    const wrongCoach = await clientA1.client
      .from("appointments")
      .insert({ coach_id: coachB.userId, client_id: clientA1.id, type: "online", status: "requested", ...range });
    expect(wrongCoach.error).not.toBeNull();
  });

  it("cannot request a time in the past", async () => {
    const { error } = await clientA1.client
      .from("appointments")
      .insert({ coach_id: coachA.userId, client_id: clientA1.id, type: "online", status: "requested", ...slot(-1) });
    expect(error?.hint).toBe("in_the_past");
  });

  it("cannot edit session details, only cancel or ask to reschedule", async () => {
    const { data } = await coachBooks(slot(14), clientA1);
    const edit = await clientA1.client.from("appointments").update({ ...slot(15) }).eq("id", data!.id);
    expect(edit.error?.code).toBe("42501");
    const confirmSelf = await clientA1.client.from("appointments").update({ status: "completed" }).eq("id", data!.id);
    expect(confirmSelf.error?.code).toBe("42501");

    const ask = await clientA1.client
      .from("appointments")
      .update({ reschedule_requested_at: new Date().toISOString(), reschedule_note: "Can we move it?" })
      .eq("id", data!.id);
    expect(ask.error).toBeNull();
    const row = await coachA.client.from("appointments").select("reschedule_requested_at").eq("id", data!.id).single();
    expect(row.data?.reschedule_requested_at).not.toBeNull();
  });

  it("cancels a far-off session and is recorded as the canceller", async () => {
    const { data } = await coachBooks(slot(16), clientA1);
    const { error } = await clientA1.client.from("appointments").update({ status: "cancelled", cancel_reason: "sick" }).eq("id", data!.id);
    expect(error).toBeNull();
    const row = await coachA.client.from("appointments").select("status, cancelled_by").eq("id", data!.id).single();
    expect(row.data).toEqual({ status: "cancelled", cancelled_by: clientA1.userId });
  });

  it("is refused inside the cancel cutoff (default 12h), but may withdraw a pending request", async () => {
    const soon = await coachBooks(slot(0, 2), clientA2);
    expect(soon.error).toBeNull();
    const tooLate = await clientA2.client.from("appointments").update({ status: "cancelled" }).eq("id", soon.data!.id);
    expect(tooLate.error?.hint).toBe("cutoff_passed");

    const pending = await clientA1.client
      .from("appointments")
      .insert({ coach_id: coachA.userId, client_id: clientA1.id, type: "online", status: "requested", ...slot(0, 5) })
      .select("id")
      .single();
    expect(pending.error).toBeNull();
    const withdraw = await clientA1.client.from("appointments").update({ status: "cancelled" }).eq("id", pending.data!.id);
    expect(withdraw.error).toBeNull();
  });

  it("sees only free/busy ranges of the coach, not other clients' sessions", async () => {
    await coachBooks(slot(17), clientA2);
    const direct = await clientA1.client.from("appointments").select("id").eq("client_id", clientA2.id);
    expect(direct.data).toEqual([]);
    const busy = await clientA1.client.rpc("coach_busy_ranges", {
      p_from: new Date().toISOString(),
      p_to: new Date(Date.now() + 30 * DAY).toISOString(),
    });
    expect(busy.error).toBeNull();
    expect(busy.data!.length).toBeGreaterThan(0);
    expect(Object.keys(busy.data![0]).sort()).toEqual(["ends_at", "starts_at"]);
  });
});

describe("plan and account gates", () => {
  it("a Starter coach cannot take scheduling, and a client cannot book them", async () => {
    const starterCoach = await createCoach("starter");
    const starterClient = await createClientRow(starterCoach, "starter");
    const { data: tier } = await admin.from("subscription_tiers").select("id").eq("key", "starter").single();
    await admin.from("subscriptions").update({ tier_id: tier!.id }).eq("coach_id", starterCoach.userId);

    const byCoach = await starterCoach.client
      .from("appointments")
      .insert({ coach_id: starterCoach.userId, client_id: starterClient.id, type: "online", status: "confirmed", ...slot(3) });
    expect(byCoach.error?.hint).toBe("upgrade_required");

    const byClient = await starterClient.client
      .from("appointments")
      .insert({ coach_id: starterCoach.userId, client_id: starterClient.id, type: "online", status: "requested", ...slot(3) });
    expect(byClient.error?.hint).toBe("upgrade_required");

    const enabled = await starterClient.client.rpc("appointments_enabled");
    expect(enabled.data).toBe(false);
  });

  it("a lapsed coach takes no new bookings from clients", async () => {
    const lapsedCoach = await createCoach("lapsed");
    const lapsedClient = await createClientRow(lapsedCoach, "lapsed");
    await admin.from("subscriptions").update({ status: "canceled" }).eq("coach_id", lapsedCoach.userId);

    const { error } = await lapsedClient.client
      .from("appointments")
      .insert({ coach_id: lapsedCoach.userId, client_id: lapsedClient.id, type: "online", status: "requested", ...slot(3) });
    expect(error).not.toBeNull();
  });
});

describe("admin", () => {
  it("can read appointments but not change them", async () => {
    const { data } = await coachBooks(slot(18), clientA1);
    const read = await adminUser.client.from("appointments").select("id").eq("id", data!.id);
    expect(read.data).toHaveLength(1);

    const update = await adminUser.client.from("appointments").update({ status: "cancelled" }).eq("id", data!.id).select("id");
    expect(update.data ?? []).toEqual([]);
    const insert = await adminUser.client
      .from("appointments")
      .insert({ coach_id: coachA.userId, client_id: clientA1.id, type: "online", status: "confirmed", ...slot(19) });
    expect(insert.error).not.toBeNull();
  });
});

describe("notifications", () => {
  it("tells the coach about a request and the client about a confirmation", async () => {
    const { data: request } = await clientA2.client
      .from("appointments")
      .insert({ coach_id: coachA.userId, client_id: clientA2.id, type: "online", status: "requested", ...slot(20) })
      .select("id")
      .single();
    const toCoach = await admin
      .from("notifications")
      .select("kind, payload")
      .eq("profile_id", coachA.userId)
      .eq("kind", "appointment_requested");
    expect(toCoach.data?.some((n) => (n.payload as { appointment_id?: string }).appointment_id === request!.id)).toBe(true);

    await coachA.client.from("appointments").update({ status: "confirmed" }).eq("id", request!.id);
    const toClient = await admin
      .from("notifications")
      .select("kind, payload")
      .eq("profile_id", clientA2.userId)
      .eq("kind", "appointment_confirmed");
    expect(toClient.data?.some((n) => (n.payload as { appointment_id?: string }).appointment_id === request!.id)).toBe(true);
  });
});
