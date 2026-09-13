import { describe, expect, it } from "vitest";
import { MessagesService } from "./messages.service";

function fakeSupabase(rows: unknown[] = []) {
  const inserts: { table: string; payload: unknown }[] = [];
  const updates: { table: string; payload: unknown; filters: [string, unknown][] }[] = [];

  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: (...eqArgs: [string, unknown]) =>
            eqArgs[0] === "status"
              ? Promise.resolve({ data: rows, error: null })
              : { order: () => ({ limit: async () => ({ data: rows, error: null }) }) },
        }),
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return {
            select: () => ({ single: async () => ({ data: { id: "msg-1", ...(payload as object) }, error: null }) }),
            // Real supabase-js query builders are thenable on their own (no .select()
            // needed) — broadcast() awaits the insert directly, so the fake must be too.
            then: (resolve: (result: { data: null; error: null }) => unknown) => resolve({ data: null, error: null }),
          };
        },
        update: (payload: unknown) => {
          const filters: [string, unknown][] = [];
          const chain = {
            eq: (col: string, val: unknown) => {
              filters.push([col, val]);
              return chain;
            },
            is: (col: string, val: unknown) => {
              filters.push([col, val]);
              updates.push({ table, payload, filters });
              return Promise.resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  };

  return { db: db as never, inserts, updates };
}

describe("MessagesService", () => {
  it("send inserts with the caller-resolved coach_id/client_id, never a caller-supplied one", async () => {
    const { db, inserts } = fakeSupabase();
    await new MessagesService(db).send("coach-1", "client-1", { sender_role: "client", body: "hi" });

    expect(inserts[0].table).toBe("messages");
    expect(inserts[0].payload).toEqual({
      coach_id: "coach-1",
      client_id: "client-1",
      sender_role: "client",
      body: "hi",
    });
  });

  it("markThreadRead as coach only touches messages sent by the client", async () => {
    const { db, updates } = fakeSupabase();
    await new MessagesService(db).markThreadRead("client-1", "coach");

    expect(updates[0].filters).toEqual([
      ["client_id", "client-1"],
      ["sender_role", "client"],
      ["read_at", null],
    ]);
  });

  it("markThreadRead as client only touches messages sent by the coach", async () => {
    const { db, updates } = fakeSupabase();
    await new MessagesService(db).markThreadRead("client-1", "client");

    expect(updates[0].filters).toEqual([
      ["client_id", "client-1"],
      ["sender_role", "coach"],
      ["read_at", null],
    ]);
  });

  it("listInbox sorts unread-first, then most-recently-active, then name", async () => {
    const { db } = fakeSupabase([
      { client_id: "c1", display_name: "Zaid", status: "active", last_body: "hi", last_sender_role: "coach", last_message_at: "2026-09-13T10:00:00Z", unread_count: 0 },
      { client_id: "c2", display_name: "Amr", status: "active", last_body: "yo", last_sender_role: "client", last_message_at: "2026-09-13T09:00:00Z", unread_count: 2 },
      { client_id: "c3", display_name: "Bilal", status: "active", last_body: null, last_sender_role: null, last_message_at: null, unread_count: 0 },
      { client_id: "c4", display_name: "Nadia", status: "active", last_body: "hey", last_sender_role: "client", last_message_at: "2026-09-13T11:00:00Z", unread_count: 1 },
    ]);

    const result = await new MessagesService(db).listInbox();

    expect(result.map((r) => r.client_id)).toEqual(["c4", "c2", "c1", "c3"]);
  });

  it("broadcast bulk-inserts one row per client in a single insert call", async () => {
    const { db, inserts } = fakeSupabase();
    await new MessagesService(db).broadcast("coach-1", ["client-1", "client-2"], "hi all");

    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("messages");
    expect(inserts[0].payload).toEqual([
      { coach_id: "coach-1", client_id: "client-1", sender_role: "coach", body: "hi all" },
      { coach_id: "coach-1", client_id: "client-2", sender_role: "coach", body: "hi all" },
    ]);
  });
});
