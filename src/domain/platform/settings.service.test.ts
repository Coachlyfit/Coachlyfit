import { describe, expect, it } from "vitest";
import { PlatformSettingsService } from "./settings.service";
import { SETTINGS_DEFAULTS } from "./settings.schema";

// Mirrors team.service.test.ts's fakeSupabase style: a plain object with a
// .from(table) method returning chainable stubs, no mocking library.
function fakeSupabase(rows: { key: string; value: unknown }[]) {
  const upserts: unknown[] = [];
  const db = {
    from() {
      return {
        select: () => Promise.resolve({ data: rows, error: null }),
        upsert: (payload: unknown) => {
          upserts.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { db: db as never, upserts };
}

describe("PlatformSettingsService.getAll", () => {
  it("returns defaults when the table is empty", async () => {
    const { db } = fakeSupabase([]);
    const result = await new PlatformSettingsService(db).getAll();
    expect(result).toEqual(SETTINGS_DEFAULTS);
  });

  it("overrides defaults with valid stored rows", async () => {
    const { db } = fakeSupabase([{ key: "platform", value: { maintenance_mode: true, signups_enabled: false } }]);
    const result = await new PlatformSettingsService(db).getAll();
    expect(result.platform).toEqual({ maintenance_mode: true, signups_enabled: false });
    expect(result.branding).toEqual(SETTINGS_DEFAULTS.branding);
  });

  it("falls back to the default for a malformed row instead of throwing", async () => {
    const { db } = fakeSupabase([{ key: "billing", value: { trial_days: "not-a-number" } }]);
    const result = await new PlatformSettingsService(db).getAll();
    expect(result.billing).toEqual(SETTINGS_DEFAULTS.billing);
  });

  it("ignores an unknown key", async () => {
    const { db } = fakeSupabase([{ key: "bogus", value: { anything: true } }]);
    const result = await new PlatformSettingsService(db).getAll();
    expect(result).toEqual(SETTINGS_DEFAULTS);
  });

  it("falls back to defaults when the query itself fails, instead of throwing", async () => {
    const db = {
      from() {
        return {
          select: () => Promise.resolve({ data: null, error: new Error("network error") }),
        };
      },
    };
    const result = await new PlatformSettingsService(db as never).getAll();
    expect(result).toEqual(SETTINGS_DEFAULTS);
  });
});

describe("PlatformSettingsService.set", () => {
  it("upserts the parsed value with an updated_by stamp", async () => {
    const { db, upserts } = fakeSupabase([]);
    await new PlatformSettingsService(db).set("billing", { trial_days: 7 }, "admin-1");
    expect(upserts).toHaveLength(1);
    const payload = upserts[0] as { key: string; value: unknown; updated_by: string };
    expect(payload.key).toBe("billing");
    expect(payload.value).toEqual({ trial_days: 7 });
    expect(payload.updated_by).toBe("admin-1");
  });

  it("throws on an invalid value rather than writing it", async () => {
    const { db } = fakeSupabase([]);
    await expect(
      new PlatformSettingsService(db).set("billing", { trial_days: 0 }, "admin-1")
    ).rejects.toThrow();
  });
});
