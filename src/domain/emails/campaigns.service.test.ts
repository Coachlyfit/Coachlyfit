import { describe, expect, it } from "vitest";
import { CampaignsService } from "./campaigns.service";
import { selectRecipients } from "./recipients";

function fakeSupabase(rpcRows: unknown[] = []) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];

  const db = {
    rpc: async (fn: string) => {
      calls.push({ table: fn, op: "rpc" });
      return { data: rpcRows, error: null };
    },
    from(table: string) {
      return {
        insert: (payload: unknown) => {
          calls.push({ table, op: "insert", payload });
          const result = { error: null };
          return {
            ...result,
            then: (resolve: (value: typeof result) => void) => resolve(result),
            select: () => ({ single: async () => ({ data: { id: "camp-1" }, error: null }) }),
          };
        },
        update: (payload: unknown) => {
          calls.push({ table, op: "update", payload });
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };

  return { db: db as never, calls };
}

describe("CampaignsService", () => {
  it("maps the recipients RPC rows", async () => {
    const { db, calls } = fakeSupabase([
      { coach_id: "c1", business_name: "A Gym", owner_name: "Sara", email: "a@example.com", status: "active" },
    ]);

    const recipients = await new CampaignsService(db).listRecipients();

    expect(calls).toEqual([{ table: "admin_email_recipients", op: "rpc" }]);
    expect(recipients).toEqual([
      { coachId: "c1", businessName: "A Gym", ownerName: "Sara", email: "a@example.com", status: "active" },
    ]);
  });

  it("creates the campaign as the sending admin and returns its id", async () => {
    const { db, calls } = fakeSupabase();

    const id = await new CampaignsService(db).createCampaign({
      subject: "Hello",
      body: "Body",
      direction: "rtl",
      filter: "active",
      recipientCount: 3,
      sentBy: "admin-1",
    });

    expect(id).toBe("camp-1");
    expect(calls[0]).toEqual({
      table: "email_campaigns",
      op: "insert",
      payload: {
        subject: "Hello",
        body: "Body",
        direction: "rtl",
        recipient_filter: "active",
        recipient_count: 3,
        sent_by: "admin-1",
      },
    });
  });

  it("records sent and failed recipients with their status", async () => {
    const { db, calls } = fakeSupabase();
    const sentAt = new Date("2026-10-13T10:00:00Z");

    await new CampaignsService(db).recordRecipients(
      "camp-1",
      [
        { coachId: "c1", email: "a@example.com", error: null },
        { coachId: "c2", email: "b@example.com", error: "invalid address" },
      ],
      sentAt
    );

    expect(calls[0].payload).toEqual([
      { campaign_id: "camp-1", coach_id: "c1", email: "a@example.com", status: "sent", error: null, sent_at: sentAt.toISOString() },
      { campaign_id: "camp-1", coach_id: "c2", email: "b@example.com", status: "failed", error: "invalid address", sent_at: null },
    ]);
  });

  it("skips the insert when there is nothing to record", async () => {
    const { db, calls } = fakeSupabase();
    await new CampaignsService(db).recordRecipients("camp-1", [], new Date());
    expect(calls).toEqual([]);
  });

  it("updates only the two counters", async () => {
    const { db, calls } = fakeSupabase();
    await new CampaignsService(db).setCounts("camp-1", 4, 1);
    expect(calls[0]).toEqual({ table: "email_campaigns", op: "update", payload: { sent_count: 4, failed_count: 1 } });
  });
});

describe("selectRecipients", () => {
  const coaches = [
    { coachId: "c1", status: "active" },
    { coachId: "c2", status: "trialing" },
    { coachId: "c3", status: null },
  ];

  it("returns everyone for 'all'", () => {
    expect(selectRecipients(coaches, "all", [])).toHaveLength(3);
  });

  it("keeps only status = active for 'active'", () => {
    expect(selectRecipients(coaches, "active", []).map((c) => c.coachId)).toEqual(["c1"]);
  });

  it("keeps only known picked ids for 'selected'", () => {
    expect(selectRecipients(coaches, "selected", ["c3", "unknown"]).map((c) => c.coachId)).toEqual(["c3"]);
  });
});
