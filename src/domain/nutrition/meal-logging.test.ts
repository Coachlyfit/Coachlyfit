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

  it("inserts one water row per tap", async () => {
    const rows: unknown[] = [];
    const db = {
      from: () => ({
        insert: (row: unknown) => {
          rows.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    };
    await new MealLoggingService(db as never).addWater("c1", "2026-11-27", 250);
    expect(rows).toEqual([{ client_id: "c1", log_date: "2026-11-27", amount_ml: 250 }]);
  });

  it("throws when the write fails (e.g. a date outside the RLS window)", async () => {
    const db = { from: () => ({ insert: () => Promise.resolve({ error: new Error("rls") }) }) };
    await expect(new MealLoggingService(db as never).addWater("c1", "2020-01-01", 250)).rejects.toThrow("rls");
  });
});
