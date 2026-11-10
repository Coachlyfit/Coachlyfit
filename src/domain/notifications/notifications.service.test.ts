import { describe, expect, it } from "vitest";
import { NotificationsService } from "./notifications.service";

function fakeSupabase() {
  const updates: { table: string; payload: Record<string, unknown>; filters: [string, unknown][] }[] = [];
  const db = {
    from(table: string) {
      return {
        update: (payload: Record<string, unknown>) => {
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
  return { db: db as never, updates };
}

describe("NotificationsService", () => {
  it("markThreadMessagesRead only clears unread new_message entries for that thread", async () => {
    const { db, updates } = fakeSupabase();
    await new NotificationsService(db).markThreadMessagesRead("client-1");

    expect(updates[0].table).toBe("notifications");
    expect(updates[0].payload.read_at).toEqual(expect.any(String));
    expect(updates[0].filters).toEqual([
      ["kind", "new_message"],
      ["payload->>client_id", "client-1"],
      ["read_at", null],
    ]);
  });
});
