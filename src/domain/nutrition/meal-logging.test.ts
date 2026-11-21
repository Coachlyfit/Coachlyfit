import { describe, expect, it } from "vitest";
import { MealLoggingService } from "./meal-logging.service";
import { weekSummary } from "./meal-logging";

describe("weekSummary", () => {
  it("counts eaten and skipped and averages water over the days", () => {
    const s = weekSummary(
      [{ status: "eaten" }, { status: "eaten" }, { status: "skipped" }],
      [{ amount_ml: 1500 }, { amount_ml: 2000 }, { amount_ml: 500 }],
      4
    );
    expect(s).toEqual({ eaten: 2, skipped: 1, avgWaterMl: 1000 });
  });

  it("is all zeros with no logs", () => {
    expect(weekSummary([], [])).toEqual({ eaten: 0, skipped: 0, avgWaterMl: 0 });
  });
});

describe("MealLoggingService", () => {
  it("upserts a meal status on client+meal+date", async () => {
    const calls: { payload: Record<string, unknown>; options: unknown }[] = [];
    const db = {
      from: () => ({
        upsert: (payload: Record<string, unknown>, options: unknown) => {
          calls.push({ payload, options });
          return Promise.resolve({ error: null });
        },
      }),
    };
    await new MealLoggingService(db as never).setMealStatus("c1", "m1", "2026-11-27", "skipped", "not hungry");
    expect(calls[0].payload).toMatchObject({ client_id: "c1", meal_id: "m1", log_date: "2026-11-27", status: "skipped", note: "not hungry" });
    expect(calls[0].options).toEqual({ onConflict: "client_id,meal_id,log_date" });
  });

  /** Fake water table: select resolves to `existing` (newest first), writes are recorded. */
  function waterDb(existing: { id: string; amount_ml: number }[], insertError: Error | null = null) {
    const inserted: unknown[][] = [];
    const deleted: string[][] = [];
    const db = {
      from: () => ({
        select: () => {
          const c: Record<string, unknown> = { then: (res: (v: unknown) => unknown) => res({ data: existing, error: null }) };
          c.eq = () => c;
          c.order = () => c;
          return c;
        },
        insert: (rows: unknown[]) => {
          inserted.push(rows);
          return Promise.resolve({ error: insertError });
        },
        delete: () => ({
          in: (_col: string, ids: string[]) => {
            deleted.push(ids);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };
    return { db, inserted, deleted };
  }

  it("adds cup rows to reach a higher cup count", async () => {
    const { db, inserted, deleted } = waterDb([{ id: "a", amount_ml: 250 }]);
    await new MealLoggingService(db as never).setWaterCups("c1", "2026-11-27", 3);
    expect(inserted[0]).toEqual([
      { client_id: "c1", log_date: "2026-11-27", amount_ml: 250 },
      { client_id: "c1", log_date: "2026-11-27", amount_ml: 250 },
    ]);
    expect(deleted).toEqual([]);
  });

  it("removes the newest rows to reach a lower cup count", async () => {
    // newest first
    const { db, inserted, deleted } = waterDb([
      { id: "c", amount_ml: 250 },
      { id: "b", amount_ml: 250 },
      { id: "a", amount_ml: 250 },
    ]);
    await new MealLoggingService(db as never).setWaterCups("c1", "2026-11-27", 1);
    expect(deleted).toEqual([["c", "b"]]);
    expect(inserted).toEqual([]);
  });

  it("does nothing when the count already matches", async () => {
    const { db, inserted, deleted } = waterDb([{ id: "a", amount_ml: 250 }]);
    await new MealLoggingService(db as never).setWaterCups("c1", "2026-11-27", 1);
    expect(inserted).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it("throws when the write fails (e.g. a date outside the RLS window)", async () => {
    const { db } = waterDb([], new Error("rls"));
    await expect(new MealLoggingService(db as never).setWaterCups("c1", "2020-01-01", 1)).rejects.toThrow("rls");
  });
});
