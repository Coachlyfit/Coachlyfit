import { describe, expect, it } from "vitest";
import { MessagesService } from "./messages.service";

function fakeSupabase(rows: unknown[] = [], insertError: { code: string } | null = null) {
  const inserts: { table: string; payload: unknown }[] = [];
  const threadQueries: { filters: [string, unknown][]; limit: number }[] = [];
  const updates: { table: string; payload: unknown; filters: [string, unknown][] }[] = [];

  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: (...eqArgs: [string, unknown]) => {
            if (eqArgs[0] === "status") return Promise.resolve({ data: rows, error: null });
            const filters: [string, unknown][] = [eqArgs];
            const chain = {
              lt: (col: string, val: unknown) => {
                filters.push([col, val]);
                return chain;
              },
              order: () => ({
                limit: async (limit: number) => {
                  threadQueries.push({ filters, limit });
                  return { data: rows.slice(0, limit), error: null };
                },
              }),
            };
            return chain;
          },
        }),
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return {
            // Real supabase-js query builders are thenable on their own (no .select()
            // needed) — send() and broadcast() await the insert directly, so the fake must be too.
            then: (resolve: (result: { data: null; error: { code: string } | null }) => unknown) =>
              resolve({ data: null, error: insertError }),
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

  return { db: db as never, inserts, updates, threadQueries };
}

// Voice notes touch storage as well as the table, which fakeSupabase above
// doesn't model.
function fakeVoiceSupabase(opts: {
  uploadError?: { statusCode: string } | null;
  insertError?: { code: string } | null;
  message?: { audio_path: string | null; audio_deleted_at: string | null } | null;
} = {}) {
  const calls: { op: string; args: unknown[] }[] = [];
  const db = {
    from: () => ({
      insert: async (payload: unknown) => {
        calls.push({ op: "insert", args: [payload] });
        return { error: opts.insertError ?? null };
      },
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: opts.message ?? null, error: null }) }),
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _file: Blob, options: unknown) => {
          calls.push({ op: "upload", args: [bucket, path, options] });
          return { error: opts.uploadError ?? null };
        },
        createSignedUrl: async (path: string, expiresIn: number) => {
          calls.push({ op: "sign", args: [bucket, path, expiresIn] });
          return { data: { signedUrl: `signed:${path}` }, error: null };
        },
      }),
    },
  };
  return { db: db as never, calls };
}

const voiceInput = {
  id: "m-1",
  sender_role: "client" as const,
  file: new Blob(["12345"]),
  mime: "audio/webm" as const,
  durationSec: 7,
};

describe("MessagesService voice notes", () => {
  it("sendVoice uploads under relationship/message id, then inserts the row that points at it", async () => {
    const { db, calls } = fakeVoiceSupabase();
    await new MessagesService(db).sendVoice("coach-1", "client-1", "rel-1", voiceInput);

    expect(calls).toEqual([
      { op: "upload", args: ["voice-notes", "rel-1/m-1.webm", { contentType: "audio/webm", upsert: false }] },
      {
        op: "insert",
        args: [
          {
            id: "m-1",
            coach_id: "coach-1",
            client_id: "client-1",
            sender_role: "client",
            kind: "voice",
            body: "",
            audio_path: "rel-1/m-1.webm",
            audio_mime: "audio/webm",
            audio_duration_sec: 7,
            audio_size_bytes: 5,
          },
        ],
      },
    ]);
  });

  it("sendVoice treats a retry as done: file already there, row already there", async () => {
    const { db, calls } = fakeVoiceSupabase({ uploadError: { statusCode: "409" }, insertError: { code: "23505" } });
    await expect(new MessagesService(db).sendVoice("coach-1", "client-1", "rel-1", voiceInput)).resolves.toBeUndefined();
    expect(calls.map((c) => c.op)).toEqual(["upload", "insert"]);
  });

  it("sendVoice never inserts a row when the upload was refused", async () => {
    const { db, calls } = fakeVoiceSupabase({ uploadError: { statusCode: "403" } });
    await expect(new MessagesService(db).sendVoice("coach-1", "client-1", "rel-1", voiceInput)).rejects.toEqual({
      statusCode: "403",
    });
    expect(calls.map((c) => c.op)).toEqual(["upload"]);
  });

  it("signVoiceUrl signs a live note briefly, and nothing for an expired or unreadable one", async () => {
    const live = fakeVoiceSupabase({ message: { audio_path: "rel-1/m-1.webm", audio_deleted_at: null } });
    expect(await new MessagesService(live.db).signVoiceUrl("m-1")).toBe("signed:rel-1/m-1.webm");
    expect(live.calls).toEqual([{ op: "sign", args: ["voice-notes", "rel-1/m-1.webm", 300] }]);

    const expired = fakeVoiceSupabase({ message: { audio_path: "rel-1/m-1.webm", audio_deleted_at: "2026-10-01T00:00:00Z" } });
    expect(await new MessagesService(expired.db).signVoiceUrl("m-1")).toBeNull();
    expect(expired.calls).toEqual([]);

    expect(await new MessagesService(fakeVoiceSupabase().db).signVoiceUrl("m-1")).toBeNull();
  });
});

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

  it("send passes a caller-generated id through, and treats a duplicate of it as already sent", async () => {
    const { db, inserts } = fakeSupabase([], { code: "23505" });
    await expect(
      new MessagesService(db).send("coach-1", "client-1", { id: "m-1", sender_role: "coach", body: "hi" }),
    ).resolves.toBeUndefined();
    expect(inserts[0].payload).toMatchObject({ id: "m-1" });
  });

  it("send still throws on a duplicate when no id was supplied, and on any other error", async () => {
    await expect(
      new MessagesService(fakeSupabase([], { code: "23505" }).db).send("coach-1", "client-1", { sender_role: "coach", body: "hi" }),
    ).rejects.toEqual({ code: "23505" });
    await expect(
      new MessagesService(fakeSupabase([], { code: "42501" }).db).send("coach-1", "client-1", { id: "m-1", sender_role: "coach", body: "hi" }),
    ).rejects.toEqual({ code: "42501" });
  });

  it("listThreadPage returns the newest page oldest-first and reports an older page", async () => {
    // The fake returns rows as the query orders them: newest first.
    const { db, threadQueries } = fakeSupabase([{ id: "m3" }, { id: "m2" }, { id: "m1" }]);
    const page = await new MessagesService(db).listThreadPage("client-1", { limit: 2 });

    expect(page.messages.map((m) => m.id)).toEqual(["m2", "m3"]);
    expect(page.hasMore).toBe(true);
    expect(threadQueries[0]).toEqual({ filters: [["client_id", "client-1"]], limit: 3 });
  });

  it("listThreadPage pages backwards from the cursor and stops when nothing older is left", async () => {
    const { db, threadQueries } = fakeSupabase([{ id: "m1" }]);
    const page = await new MessagesService(db).listThreadPage("client-1", { before: "2026-09-13T10:00:00Z", limit: 2 });

    expect(page).toEqual({ messages: [{ id: "m1" }], hasMore: false });
    expect(threadQueries[0].filters).toEqual([
      ["client_id", "client-1"],
      ["created_at", "2026-09-13T10:00:00Z"],
    ]);
  });

  it("listInbox flags a thread as awaiting read only when the coach's last message is unread", async () => {
    const base = { status: "active", last_body: "x", last_message_at: "2026-09-13T10:00:00Z", unread_count: 0 };
    const { db } = fakeSupabase([
      { ...base, client_id: "unread-mine", display_name: "A", last_sender_role: "coach", last_read_at: null },
      { ...base, client_id: "read-mine", display_name: "B", last_sender_role: "coach", last_read_at: "2026-09-13T11:00:00Z" },
      { ...base, client_id: "theirs", display_name: "C", last_sender_role: "client", last_read_at: null },
      // Pre-migration view: no last_read_at column at all.
      { ...base, client_id: "unknown", display_name: "D", last_sender_role: "coach" },
    ]);

    const result = await new MessagesService(db).listInbox();

    expect(result.filter((r) => r.awaiting_read).map((r) => r.client_id)).toEqual(["unread-mine"]);
  });

  it("listBroadcastRecipients splits everyone from clients with a live subscription", async () => {
    const { db } = fakeSupabase([
      { client_id: "live", subscription_status: "active", subscription_end_date: "2026-12-31" },
      { client_id: "expired", subscription_status: "active", subscription_end_date: "2026-01-01" },
      { client_id: "frozen", subscription_status: "frozen", subscription_end_date: "2026-12-31" },
      { client_id: "none", subscription_status: null, subscription_end_date: null },
    ]);

    const result = await new MessagesService(db).listBroadcastRecipients(new Date("2026-10-08T00:00:00Z"));

    expect(result).toEqual({ all: ["live", "expired", "frozen", "none"], subscribed: ["live"] });
  });
});
