import { describe, expect, it } from "vitest";
import { AppointmentsService, appointmentError } from "./appointments.service";

describe("appointmentError", () => {
  it("tells a coach clash from a client clash", () => {
    const base = { code: "23P01" };
    expect(
      appointmentError({ ...base, message: 'conflicting key value violates exclusion constraint "appointments_no_coach_overlap"' })
    ).toBe("slot_taken");
    expect(
      appointmentError({ ...base, message: 'conflicting key value violates exclusion constraint "appointments_no_client_overlap"' })
    ).toBe("client_busy");
  });

  it("passes the trigger hints through", () => {
    for (const hint of ["upgrade_required", "cutoff_passed", "invalid_transition", "not_started", "in_the_past"]) {
      expect(appointmentError({ code: "23514", hint })).toBe(hint);
    }
  });

  it("maps an RLS refusal and anything else", () => {
    expect(appointmentError({ code: "42501" })).toBe("not_found_or_forbidden");
    expect(appointmentError(new Error("boom"))).toBe("unknown");
    expect(appointmentError(null)).toBe("unknown");
  });
});

function fakeSupabase(updateResult: { data: { id: string }[] | null; error: unknown } = { data: [{ id: "a1" }], error: null }) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];
  const db = {
    from(table: string) {
      return {
        update: (payload: unknown) => {
          calls.push({ table, op: "update", payload });
          return { eq: () => ({ select: async () => updateResult }) };
        },
        insert: (payload: unknown) => {
          calls.push({ table, op: "insert", payload });
          return { select: () => ({ single: async () => ({ data: { id: "new-id" }, error: null }) }) };
        },
      };
    },
  };
  return { db: db as never, calls };
}

describe("AppointmentsService", () => {
  it("creates with the coach id and returns the new id", async () => {
    const { db, calls } = fakeSupabase();
    const id = await new AppointmentsService(db).create("coach-1", {
      client_id: "c1",
      starts_at: "2026-01-18T07:00:00Z",
      ends_at: "2026-01-18T08:00:00Z",
      type: "online",
      location_or_link: null,
      notes: null,
      status: "confirmed",
    });
    expect(id).toBe("new-id");
    expect(calls[0]).toMatchObject({ table: "appointments", op: "insert", payload: { coach_id: "coach-1", status: "confirmed" } });
  });

  it("confirm / cancel / complete / no-show write the status", async () => {
    const { db, calls } = fakeSupabase();
    const svc = new AppointmentsService(db);
    await svc.confirm("a1");
    await svc.cancel("a1", "sick");
    await svc.complete("a1");
    await svc.markNoShow("a1");
    expect(calls.map((c) => c.payload)).toEqual([
      { status: "confirmed" },
      { status: "cancelled", cancel_reason: "sick" },
      { status: "completed" },
      { status: "no_show" },
    ]);
  });

  it("returns false when RLS matched no row, and throws on a database error", async () => {
    expect(await new AppointmentsService(fakeSupabase({ data: [], error: null }).db).confirm("a1")).toBe(false);
    const err = { code: "23P01" };
    await expect(new AppointmentsService(fakeSupabase({ data: null, error: err }).db).confirm("a1")).rejects.toBe(err);
  });
});
