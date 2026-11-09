import { describe, expect, it } from "vitest";
import { CoachHomeService } from "./coach-home.service";

const NOW = new Date("2026-10-05T09:00:00Z");

type Result = { data?: unknown; count?: number; error?: unknown };

/** Every query-builder method returns the same thenable and records its
 * call, so a test can assert on the filters a query was built with without
 * caring about the order they were chained in. */
function fakeSupabase(results: Record<string, Result>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];

  const db = {
    from(table: string) {
      const builder: Record<string, unknown> = {
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: [], count: 0, error: null, ...results[table] }),
      };
      for (const method of ["select", "is", "not", "eq", "in", "lt", "gte", "lte", "order", "limit"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        };
      }
      return builder;
    },
  };

  const filters = (table: string) =>
    calls.filter((c) => c.table === table && c.method !== "select").map((c) => [c.method, ...c.args]);

  return { db: db as never, filters };
}

describe("CoachHomeService.attentionCounts", () => {
  it("counts unreviewed submissions, overdue invoices and programs ending in the next 7 days", async () => {
    const { db, filters } = fakeSupabase({
      form_submissions: { count: 7 },
      invoices: { count: 3 },
      programs: { count: 4 },
      checkins: { count: 2 },
    });

    expect(await new CoachHomeService(db).attentionCounts(NOW)).toEqual({
      awaitingReview: 7,
      overdueInvoices: 3,
      programsEnding: 4,
      pendingCheckins: 2,
    });
    expect(filters("form_submissions")).toEqual([["is", "reviewed_at", null]]);
    expect(filters("invoices")).toEqual([
      ["eq", "status", "issued"],
      ["lt", "due_date", "2026-10-05"],
    ]);
    expect(filters("programs")).toEqual([
      ["not", "client_id", "is", null],
      ["is", "archived_at", null],
      ["gte", "end_date", "2026-10-05"],
      ["lte", "end_date", "2026-10-11"],
    ]);
  });

  it("throws instead of reporting a failed count as zero", async () => {
    const { db } = fakeSupabase({ invoices: { error: new Error("denied") } });
    await expect(new CoachHomeService(db).attentionCounts(NOW)).rejects.toThrow("denied");
  });
});

describe("CoachHomeService.listInbox", () => {
  const row = {
    id: "s1",
    client_id: "c1",
    checkin_date: "2026-10-05",
    reviewed_at: null,
    clients: { display_name: "Sara" },
  };

  it("maps rows and applies no review filter for 'all'", async () => {
    const { db, filters } = fakeSupabase({ checkins: { data: [row] } });

    expect(await new CoachHomeService(db).listInbox("all", 6)).toEqual([
      {
        id: "s1",
        clientId: "c1",
        clientName: "Sara",
        template: null,
        submittedAt: "2026-10-05",
        reviewed: false,
      },
    ]);
    expect(filters("checkins")).toEqual([
      ["order", "checkin_date", { ascending: false }],
      ["limit", 6],
    ]);
  });

  it("filters on reviewed_at for 'new' and 'reviewed'", async () => {
    const fresh = fakeSupabase({});
    await new CoachHomeService(fresh.db).listInbox("new", 6);
    expect(fresh.filters("checkins")).toContainEqual(["is", "reviewed_at", null]);

    const done = fakeSupabase({});
    await new CoachHomeService(done.db).listInbox("reviewed", 6);
    expect(done.filters("checkins")).toContainEqual(["not", "reviewed_at", "is", null]);
  });
});

describe("CoachHomeService.listQuietClients", () => {
  it("returns late active clients, capped at the limit", async () => {
    const { db, filters } = fakeSupabase({
      clients: {
        data: [
          { id: "a", display_name: "A", status: "active" },
          { id: "b", display_name: "B", status: "active" },
          { id: "c", display_name: "C", status: "active" },
        ],
      },
      checkins: {
        data: [
          { client_id: "a", checkin_date: "2026-10-04" },
          { client_id: "b", checkin_date: "2026-09-25" },
          { client_id: "c", checkin_date: "2026-09-20" },
        ],
      },
    });

    expect(await new CoachHomeService(db).listQuietClients(NOW, 1)).toEqual([{ id: "c", name: "C", days: 15 }]);
    expect(filters("checkins")).toEqual([["gte", "checkin_date", "2026-07-07"]]);
  });
});

describe("CoachHomeService.listPaymentsThisWeek", () => {
  it("derives overdue / due / paid from status and due date", async () => {
    const { db, filters } = fakeSupabase({
      invoices: {
        data: [
          { id: "i1", total: 1500, currency: "EGP", status: "issued", due_date: "2026-10-01", clients: { display_name: "Youssef" } },
          { id: "i2", total: 1200, currency: "EGP", status: "paid", due_date: "2026-10-04", clients: { display_name: "Mariam" } },
          { id: "i3", total: 2000, currency: "EGP", status: "issued", due_date: "2026-10-07", clients: null },
        ],
      },
    });

    const rows = await new CoachHomeService(db).listPaymentsThisWeek(NOW, 5);

    expect(rows.map((r) => [r.clientName, r.status])).toEqual([
      ["Youssef", "overdue"],
      ["Mariam", "paid"],
      ["", "due"],
    ]);
    expect(filters("invoices")).toEqual([
      ["in", "status", ["issued", "paid"]],
      ["gte", "due_date", "2026-09-28"],
      ["lte", "due_date", "2026-10-11"],
      ["order", "due_date", { ascending: true }],
      ["limit", 5],
    ]);
  });
});
