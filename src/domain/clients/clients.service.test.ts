import { describe, expect, it } from "vitest";
import { ClientsService } from "./clients.service";

function fakeSupabase(readRow: { profile_id: string | null } | null = null) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];

  const db = {
    from(table: string) {
      return {
        update: (payload: unknown) => {
          calls.push({ table, op: "update", payload });
          return { eq: async () => ({ error: null }) };
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              calls.push({ table, op: "select" });
              return { data: readRow, error: null };
            },
          }),
        }),
      };
    },
  };

  return { db: db as never, calls };
}

describe("ClientsService.listRoster", () => {
  it("reads the roster view once and maps missing program/subscription to null", async () => {
    const tables: string[] = [];
    const rows = [
      {
        client_id: "c1",
        display_name: "Alice",
        email: "a@example.com",
        status: "active",
        last_checkin_date: "2026-08-01",
        adherence: 80,
        program_id: "p1",
        program_name_ar: "قوة",
        program_name_en: "Strength",
        subscription_status: "active",
        subscription_end_date: "2026-09-01",
      },
      {
        client_id: "c2",
        display_name: "Bob",
        email: null,
        status: "invited",
        last_checkin_date: null,
        adherence: null,
        program_id: null,
        program_name_ar: null,
        program_name_en: null,
        subscription_status: null,
        subscription_end_date: null,
      },
    ];
    const db = {
      from(table: string) {
        tables.push(table);
        return { select: () => ({ order: async () => ({ data: rows, error: null }) }) };
      },
    };

    const roster = await new ClientsService(db as never).listRoster();

    expect(tables).toEqual(["coach_client_roster"]);
    expect(roster[0]).toMatchObject({
      id: "c1",
      program: { id: "p1", name_en: "Strength" },
      subscription: { status: "active", end_date: "2026-09-01" },
    });
    expect(roster[1]).toMatchObject({ id: "c2", lastCheckin: null, program: null, subscription: null });
  });
});

describe("ClientsService.update", () => {
  it("writes display_name/email/phone, normalizing empty strings to null", async () => {
    const { db, calls } = fakeSupabase();
    const ok = await new ClientsService(db).update("client-1", {
      display_name: "Alice",
      email: "",
      phone: "0100",
    });

    expect(ok).toBe(true);
    expect(calls[0]).toMatchObject({
      table: "clients",
      op: "update",
      payload: { display_name: "Alice", email: null, phone: "0100" },
    });
  });
});

describe("ClientsService.setArchived", () => {
  it("archiving sets status='archived' without reading the row first", async () => {
    const { db, calls } = fakeSupabase();
    const ok = await new ClientsService(db).setArchived("client-1", true);

    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ payload: { status: "archived" } });
  });

  it("restoring a linked client goes back to active", async () => {
    const { db, calls } = fakeSupabase({ profile_id: "profile-1" });
    const ok = await new ClientsService(db).setArchived("client-1", false);

    expect(ok).toBe(true);
    expect(calls[1]).toMatchObject({ payload: { status: "active" } });
  });

  it("restoring a never-joined client goes back to invited", async () => {
    const { db, calls } = fakeSupabase({ profile_id: null });
    const ok = await new ClientsService(db).setArchived("client-1", false);

    expect(ok).toBe(true);
    expect(calls[1]).toMatchObject({ payload: { status: "invited" } });
  });
});
