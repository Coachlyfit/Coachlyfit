import { describe, expect, it } from "vitest";
import { LeadsService } from "./leads.service";

function fakeSupabase(upserted: { id: string }[] = []) {
  const calls: { table: string; op: string; payload?: unknown; options?: unknown }[] = [];

  const db = {
    from(table: string) {
      return {
        update: (payload: unknown) => {
          calls.push({ table, op: "update", payload });
          return { eq: async () => ({ error: null }) };
        },
        insert: async (payload: unknown) => {
          calls.push({ table, op: "insert", payload });
          return { error: null };
        },
        upsert: (payload: unknown, options: unknown) => {
          calls.push({ table, op: "upsert", payload, options });
          return { select: async () => ({ data: upserted, error: null }) };
        },
      };
    },
  };

  return { db: db as never, calls };
}

describe("LeadsService.markContacted", () => {
  const at = new Date("2026-10-13T10:00:00Z");

  it("moves a new lead to contacted", async () => {
    const { db, calls } = fakeSupabase();
    await new LeadsService(db).markContacted({ id: "l1", status: "new" }, at);
    expect(calls[0].payload).toEqual({ last_contacted_at: at.toISOString(), status: "contacted" });
  });

  it.each(["replied", "signed_up", "contacted"])("leaves a %s lead's status alone", async (status) => {
    const { db, calls } = fakeSupabase();
    await new LeadsService(db).markContacted({ id: "l1", status }, at);
    expect(calls[0].payload).toEqual({ last_contacted_at: at.toISOString() });
  });
});

describe("LeadsService.importMany", () => {
  it("skips addresses that are already leads and counts the rest", async () => {
    const { db, calls } = fakeSupabase([{ id: "new-1" }]);
    const added = await new LeadsService(db).importMany([
      { email: "a@example.com", name: "A", source: "instagram" },
      { email: "b@example.com", name: null, source: null },
    ]);

    expect(added).toBe(1);
    expect(calls[0].options).toEqual({ onConflict: "email", ignoreDuplicates: true });
    expect(calls[0].payload).toEqual([
      { email: "a@example.com", full_name: "A", source: "instagram" },
      { email: "b@example.com", full_name: null, source: null },
    ]);
  });
});

describe("LeadsService.recordSend", () => {
  it("logs a failure with its error, cut to 500 characters", async () => {
    const { db, calls } = fakeSupabase();
    await new LeadsService(db).recordSend({ leadId: "l1", subject: "Hi", messageId: null, error: "x".repeat(600), sentBy: "admin" });
    expect(calls[0].payload).toMatchObject({ lead_id: "l1", status: "failed", brevo_message_id: null, sent_by: "admin" });
    expect((calls[0].payload as { error: string }).error).toHaveLength(500);
  });
});
