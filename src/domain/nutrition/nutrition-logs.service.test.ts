import { describe, expect, it } from "vitest";
import { NutritionLogsService } from "./nutrition-logs.service";

type Chain = Promise<{ data: unknown; error: null }> & Record<string, (...args: unknown[]) => Chain>;

/** Hand-rolled Supabase stand-in: `select` resolves to the canned rows for
 * that table; writes are recorded. `claimable` lists the client ids whose
 * last_reminded_on claim (conditional update) succeeds. */
function fakeSupabase(opts: { rows?: Record<string, unknown[]>; claimable?: string[] } = {}) {
  const upserts: { table: string; payload: Record<string, unknown>; options: unknown }[] = [];
  const updates: { table: string; payload: unknown; filters: unknown[][] }[] = [];
  const inserts: { table: string; payload: unknown }[] = [];
  const filters: { table: string; method: string; args: unknown[] }[] = [];

  function chain(table: string, result: () => unknown, onFilter?: (method: string, args: unknown[]) => void): Chain {
    const c = Object.assign(
      Promise.resolve().then(() => ({ data: result(), error: null })),
      {} as Record<string, (...args: unknown[]) => Chain>
    ) as Chain;
    for (const method of ["eq", "not", "gte", "lte", "in", "or", "order", "limit", "select"]) {
      c[method] = (...args: unknown[]) => {
        filters.push({ table, method, args });
        onFilter?.(method, args);
        return c;
      };
    }
    c.maybeSingle = (() => Promise.resolve({ data: (result() as unknown[])[0] ?? null, error: null })) as never;
    c.single = (() => Promise.resolve({ data: result(), error: null })) as never;
    return c;
  }

  const db = {
    from(table: string) {
      return {
        select: () => chain(table, () => opts.rows?.[table] ?? []),
        upsert: (payload: Record<string, unknown>, options: unknown) => {
          upserts.push({ table, payload, options });
          return chain(table, () => ({ id: "1", ...payload }));
        },
        update: (payload: unknown) => {
          const entry = { table, payload, filters: [] as unknown[][] };
          updates.push(entry);
          let clientId: unknown;
          return chain(
            table,
            () => (opts.claimable?.includes(clientId as string) ? [{ client_id: clientId }] : []),
            (method, args) => {
              entry.filters.push([method, ...args]);
              if (method === "eq" && args[0] === "client_id") clientId = args[1];
            }
          );
        },
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return { db: db as never, upserts, updates, inserts, filters };
}

describe("NutritionLogsService.logIntake", () => {
  it("upserts on (client_id, log_date) and sends cleared macros as explicit nulls", async () => {
    const fake = fakeSupabase();
    await new NutritionLogsService(fake.db).logIntake("coach-1", "client-1", {
      log_date: "2026-09-30",
      kcal: 2100,
      protein_g: 150,
    });
    expect(fake.upserts).toEqual([
      {
        table: "nutrition_logs",
        payload: {
          coach_id: "coach-1",
          client_id: "client-1",
          log_date: "2026-09-30",
          kcal: 2100,
          protein_g: 150,
          carb_g: null,
          fat_g: null,
        },
        options: { onConflict: "client_id,log_date" },
      },
    ]);
  });

  it("doesn't touch the off-plan columns", async () => {
    const fake = fakeSupabase();
    await new NutritionLogsService(fake.db).logIntake("coach-1", "client-1", { log_date: "2026-09-30", kcal: 1 });
    expect(Object.keys(fake.upserts[0].payload).some((k) => k.startsWith("off_plan"))).toBe(false);
  });
});

describe("NutritionLogsService.reportOffPlan", () => {
  it("sets off_plan and its details without sending kcal, so a logged total survives", async () => {
    const fake = fakeSupabase();
    await new NutritionLogsService(fake.db).reportOffPlan("coach-1", "client-1", {
      log_date: "2026-09-29",
      meal: "Dinner",
      kcal: 900,
    });
    const payload = fake.upserts[0].payload;
    expect(payload).toMatchObject({
      off_plan: true,
      off_plan_meal: "Dinner",
      off_plan_kcal: 900,
      off_plan_note: null,
      off_plan_photo_path: null,
    });
    expect("kcal" in payload).toBe(false);
    expect(fake.upserts[0].options).toEqual({ onConflict: "client_id,log_date" });
  });
});

describe("NutritionLogsService.latestWeight", () => {
  it("returns the newest non-null check-in weight", async () => {
    const fake = fakeSupabase({ rows: { checkins: [{ weight: 82.5, checkin_date: "2026-09-28" }] } });
    expect(await new NutritionLogsService(fake.db).latestWeight("client-1")).toEqual({ weight: 82.5, date: "2026-09-28" });
    expect(fake.filters).toContainEqual({ table: "checkins", method: "not", args: ["weight", "is", null] });
  });

  it("is null with no weighed check-in", async () => {
    expect(await new NutritionLogsService(fakeSupabase().db).latestWeight("client-1")).toBeNull();
  });
});

describe("NutritionLogsService.sendDueReminders", () => {
  const setting = (client_id: string, extra: object = {}) => ({
    client_id,
    enabled: true,
    remind_at: "20:00:00",
    timezone: "Asia/Riyadh",
    last_reminded_on: null,
    clients: { profile_id: `profile-${client_id}`, status: "active" },
    ...extra,
  });
  const now = new Date("2026-09-30T18:00:00Z"); // 21:00 in Riyadh

  it("notifies clients who haven't logged their local today, and claims the day", async () => {
    const fake = fakeSupabase({
      rows: {
        nutrition_reminder_settings: [setting("a"), setting("b")],
        nutrition_logs: [{ client_id: "b", log_date: "2026-09-30" }],
      },
      claimable: ["a", "b"],
    });
    const sent = await new NutritionLogsService(fake.db).sendDueReminders(now);

    expect(sent).toBe(1);
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0].payload).toEqual({ last_reminded_on: "2026-09-30" });
    expect(fake.inserts).toEqual([
      {
        table: "notifications",
        payload: { profile_id: "profile-a", kind: "nutrition_log_reminder", payload: { log_date: "2026-09-30" } },
      },
    ]);
  });

  it("doesn't notify when another run already claimed the day", async () => {
    const fake = fakeSupabase({ rows: { nutrition_reminder_settings: [setting("a")] }, claimable: [] });
    expect(await new NutritionLogsService(fake.db).sendDueReminders(now)).toBe(0);
    expect(fake.inserts).toEqual([]);
  });

  it("skips clients whose reminder time hasn't come yet or whose timezone is invalid", async () => {
    const fake = fakeSupabase({
      rows: {
        nutrition_reminder_settings: [setting("a", { remind_at: "22:00" }), setting("b", { timezone: "Bad/Zone" })],
      },
      claimable: ["a", "b"],
    });
    expect(await new NutritionLogsService(fake.db).sendDueReminders(now)).toBe(0);
    expect(fake.updates).toEqual([]);
  });

  it("does nothing with no enabled settings", async () => {
    const fake = fakeSupabase();
    expect(await new NutritionLogsService(fake.db).sendDueReminders(now)).toBe(0);
    expect(fake.filters.some((f) => f.table === "nutrition_logs")).toBe(false);
  });
});

describe("NutritionLogsService.suggestionFor", () => {
  it("combines the body profile with the latest check-in weight", async () => {
    const fake = fakeSupabase({
      rows: {
        client_body_profiles: [
          { client_id: "c", height_cm: 180, birth_date: "1996-06-15", sex: "male", activity_level: "moderate", goal: "maintain" },
        ],
        checkins: [{ weight: 80, checkin_date: "2026-09-28" }],
      },
    });
    const { result, weight } = await new NutritionLogsService(fake.db).suggestionFor("c", new Date(Date.UTC(2026, 8, 30)));
    expect(weight).toEqual({ weight: 80, date: "2026-09-28" });
    expect(result).toMatchObject({ ok: true, targets: { kcal: 2760 } });
  });

  it("reports what's missing when nothing is stored yet", async () => {
    const { result } = await new NutritionLogsService(fakeSupabase().db).suggestionFor("c", new Date());
    expect(result).toMatchObject({ ok: false, missing: ["weight", "height", "birthDate", "sex", "activityLevel", "goal"] });
  });
});
