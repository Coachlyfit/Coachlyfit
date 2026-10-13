import { describe, expect, it } from "vitest";
import { SupportService } from "./support.service";

type Call = { op: string; args: unknown[] };

function fakeSupabase(opts: { updated?: { id: string }[]; count?: number | null; signed?: unknown[] } = {}) {
  const calls: Call[] = [];

  const db = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ op: "rpc", args: [name, args] });
      return { error: null };
    },
    from(table: string) {
      return {
        insert: async (payload: unknown) => {
          calls.push({ op: "insert", args: [table, payload] });
          return { error: null };
        },
        update: (payload: unknown) => ({
          eq: (column: string, value: unknown) => ({
            select: async () => {
              calls.push({ op: "update", args: [table, payload, column, value] });
              return { data: opts.updated ?? [], error: null };
            },
          }),
        }),
        select: (columns: string, options: unknown) => ({
          eq: async (column: string, value: unknown) => {
            calls.push({ op: "count", args: [table, columns, options, column, value] });
            return { count: opts.count ?? null, error: null };
          },
        }),
      };
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[], expiresIn: number) => {
          calls.push({ op: "sign", args: [bucket, paths, expiresIn] });
          return { data: opts.signed ?? [], error: null };
        },
      }),
    },
  };

  return { db: db as never, calls };
}

describe("SupportService", () => {
  it("opens a ticket through create_support_ticket with the caller's ids", async () => {
    const { db, calls } = fakeSupabase();
    await new SupportService(db).create({
      id: "t-1",
      messageId: "m-1",
      subject: "Export broken",
      category: "technical",
      body: "Nothing happens",
      attachmentPaths: ["c/t-1/m-1/a.png"],
    });

    expect(calls).toEqual([
      {
        op: "rpc",
        args: [
          "create_support_ticket",
          {
            p_id: "t-1",
            p_message_id: "m-1",
            p_subject: "Export broken",
            p_category: "technical",
            p_body: "Nothing happens",
            p_attachment_paths: ["c/t-1/m-1/a.png"],
          },
        ],
      },
    ]);
  });

  it("a reply is public unless asked to be internal", async () => {
    const { db, calls } = fakeSupabase();
    const service = new SupportService(db);
    await service.reply("t-1", { id: "m-2", body: "Hi", attachmentPaths: [] });
    await service.reply("t-1", { id: "m-3", body: "Known bug", attachmentPaths: [], internal: true });

    expect(calls.map((call) => (call.args[1] as { is_internal: boolean }).is_internal)).toEqual([false, true]);
    expect(calls[0].args).toEqual([
      "ticket_messages",
      { id: "m-2", ticket_id: "t-1", sender_role: "coach", body: "Hi", attachment_paths: [], is_internal: false },
    ]);
  });

  it("setStatus reports whether a row was actually changed", async () => {
    const refused = fakeSupabase({ updated: [] });
    expect(await new SupportService(refused.db).setStatus("t-1", "closed")).toBe(false);

    const done = fakeSupabase({ updated: [{ id: "t-1" }] });
    expect(await new SupportService(done.db).setStatus("t-1", "closed")).toBe(true);
    expect(done.calls).toEqual([{ op: "update", args: ["support_tickets", { status: "closed" }, "id", "t-1"] }]);
  });

  it("counts unread on the caller's own side", async () => {
    const coach = fakeSupabase({ count: 2 });
    expect(await new SupportService(coach.db).unreadCount("coach")).toBe(2);
    expect(coach.calls[0].args.slice(3)).toEqual(["coach_unread", true]);

    const admin = fakeSupabase({ count: null });
    expect(await new SupportService(admin.db).unreadCount("admin")).toBe(0);
    expect(admin.calls[0].args.slice(3)).toEqual(["admin_unread", true]);
  });

  it("signs attachments by path and skips the ones that failed", async () => {
    const none = fakeSupabase();
    expect(await new SupportService(none.db).signAttachments([])).toEqual({});
    expect(none.calls).toEqual([]);

    const some = fakeSupabase({
      signed: [
        { path: "a.png", signedUrl: "https://signed/a" },
        { path: "b.png", signedUrl: "", error: "Object not found" },
      ],
    });
    expect(await new SupportService(some.db).signAttachments(["a.png", "b.png"])).toEqual({ "a.png": "https://signed/a" });
    expect(some.calls).toEqual([{ op: "sign", args: ["support-attachments", ["a.png", "b.png"], 3600] }]);
  });
});
