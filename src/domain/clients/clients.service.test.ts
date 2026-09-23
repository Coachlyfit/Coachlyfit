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
