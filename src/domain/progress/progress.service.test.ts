import { describe, expect, it } from "vitest";
import { ProgressService } from "./progress.service";

type ProgressQueryChain = Promise<{ data: unknown[]; error: null }> & {
  eq: (column: string, value: unknown) => ProgressQueryChain;
  gte: (column: string, value: unknown) => ProgressQueryChain;
  order: () => ProgressQueryChain;
  limit: () => ProgressQueryChain;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
};

function fakeSupabase(
  rows: unknown[],
  storageResponse?: { data: { path: string | null; error: string | null; signedUrl: string | null }[] }
) {
  const upserts: { table: string; payload: unknown; options: unknown }[] = [];
  const inserts: { table: string; payload: unknown }[] = [];
  const eqCalls: { column: string; value: unknown }[] = [];
  const gteCalls: { column: string; value: unknown }[] = [];
  const fromCalls: string[] = [];
  const storageCalls: { paths: string[]; expiresIn: number }[] = [];
  let limitCallCount = 0;

  function query(): ProgressQueryChain {
    const chain: ProgressQueryChain = Object.assign(Promise.resolve({ data: rows, error: null }), {
      eq: (column: string, value: unknown) => {
        eqCalls.push({ column, value });
        return chain;
      },
      gte: (column: string, value: unknown) => {
        gteCalls.push({ column, value });
        return chain;
      },
      order: () => chain,
      limit: () => {
        limitCallCount++;
        return chain;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    });
    return chain;
  }

  const db = {
    from(table: string) {
      fromCalls.push(table);
      return {
        select: () => query(),
        upsert: (payload: unknown, options: unknown) => {
          upserts.push({ table, payload, options });
          return { select: () => ({ single: async () => ({ data: { id: "1", ...(payload as object) }, error: null }) }) };
        },
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return { select: () => ({ single: async () => ({ data: { id: "1", ...(payload as object) }, error: null }) }) };
        },
      };
    },
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[], expiresIn: number) => {
          storageCalls.push({ paths, expiresIn });
          return storageResponse ?? { data: [], error: null };
        },
      }),
    },
  };

  return {
    db: db as never,
    upserts,
    inserts,
    eqCalls,
    gteCalls,
    fromCalls,
    storageCalls,
    limitCallCount: () => limitCallCount,
  };
}

describe("ProgressService.submitCheckin", () => {
  it("upserts on (client_id, checkin_date) so a same-day resubmit updates, not duplicates", async () => {
    const { db, upserts } = fakeSupabase([]);
    await new ProgressService(db).submitCheckin("coach-1", "client-1", {
      checkin_date: "2026-08-01",
      weight: 80,
    });

    expect(upserts[0].payload).toMatchObject({
      coach_id: "coach-1",
      client_id: "client-1",
      checkin_date: "2026-08-01",
      weight: 80,
    });
    expect(upserts[0].options).toMatchObject({ onConflict: "client_id,checkin_date" });
  });
});

describe("ProgressService.listCheckins", () => {
  it("never calls .limit() — the old ascending+limit(90) combo returned the OLDEST rows, freezing charts in the past", async () => {
    const fake = fakeSupabase([]);
    await new ProgressService(fake.db).listCheckins("client-1");
    expect(fake.limitCallCount()).toBe(0);
  });

  it("filters with gte(checkin_date, since) when a range is given", async () => {
    const { db, gteCalls } = fakeSupabase([]);
    await new ProgressService(db).listCheckins("client-1", "2026-07-01");
    expect(gteCalls).toContainEqual({ column: "checkin_date", value: "2026-07-01" });
  });

  it("issues no gte call when since is omitted", async () => {
    const { db, gteCalls } = fakeSupabase([]);
    await new ProgressService(db).listCheckins("client-1");
    expect(gteCalls).toEqual([]);
  });
});

describe("ProgressService.listBodyMetricsGrouped", () => {
  it("groups rows by metric with a single query", async () => {
    const rows = [
      { metric: "waist_cm", taken_on: "2026-07-01", value: 80 },
      { metric: "waist_cm", taken_on: "2026-07-15", value: 79 },
      { metric: "body_fat_pct", taken_on: "2026-07-10", value: 18 },
    ];
    const { db, fromCalls } = fakeSupabase(rows);
    const grouped = await new ProgressService(db).listBodyMetricsGrouped("client-1");

    expect(grouped.get("waist_cm")).toHaveLength(2);
    expect(grouped.get("body_fat_pct")).toHaveLength(1);
    expect(fromCalls.filter((t) => t === "body_metrics")).toHaveLength(1);
  });

  it("does not corrupt the accumulator for a metric named __proto__", async () => {
    const rows = [{ metric: "__proto__", taken_on: "2026-07-01", value: 1 }];
    const { db } = fakeSupabase(rows);
    const grouped = await new ProgressService(db).listBodyMetricsGrouped("client-1");
    expect(grouped.get("__proto__")).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call({}, "polluted")).toBe(false);
  });
});

describe("ProgressService.addMedia", () => {
  it("inserts coach_id and client_id alongside the input into media", async () => {
    const { db, inserts } = fakeSupabase([]);
    await new ProgressService(db).addMedia("coach-1", "client-1", {
      storage_path: "coach-1/client-1/abc.jpg",
      kind: "photo",
    });
    expect(inserts[0]).toMatchObject({
      table: "media",
      payload: { coach_id: "coach-1", client_id: "client-1", storage_path: "coach-1/client-1/abc.jpg", kind: "photo" },
    });
  });
});

describe("ProgressService.signMediaUrls", () => {
  it("returns an empty map without touching storage for an empty input", async () => {
    const { db, storageCalls } = fakeSupabase([]);
    const result = await new ProgressService(db).signMediaUrls([]);
    expect(result.size).toBe(0);
    expect(storageCalls).toEqual([]);
  });

  it("drops entries with a per-item error and keeps the rest", async () => {
    const { db } = fakeSupabase([], {
      data: [
        { path: "coach-1/client-1/a.jpg", error: null, signedUrl: "https://signed/a.jpg" },
        { path: "coach-1/client-1/b.jpg", error: "not found", signedUrl: null },
      ],
    });
    const result = await new ProgressService(db).signMediaUrls([
      "coach-1/client-1/a.jpg",
      "coach-1/client-1/b.jpg",
    ]);
    expect(result.get("coach-1/client-1/a.jpg")).toBe("https://signed/a.jpg");
    expect(result.has("coach-1/client-1/b.jpg")).toBe(false);
    expect(result.size).toBe(1);
  });
});
