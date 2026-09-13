import { describe, expect, it } from "vitest";
import { platformSettingsSchemas, SETTINGS_DEFAULTS, isSettingKey } from "./settings.schema";

describe("platformSettingsSchemas", () => {
  it("parses every default value against its own schema", () => {
    for (const key of Object.keys(SETTINGS_DEFAULTS) as (keyof typeof SETTINGS_DEFAULTS)[]) {
      const result = platformSettingsSchemas[key].safeParse(SETTINGS_DEFAULTS[key]);
      expect(result.success).toBe(true);
    }
  });

  it("rejects malformed values", () => {
    expect(platformSettingsSchemas.platform.safeParse({ maintenance_mode: "yes" }).success).toBe(false);
    expect(platformSettingsSchemas.branding.safeParse({ support_email: "not-an-email" }).success).toBe(false);
    expect(platformSettingsSchemas.billing.safeParse({ trial_days: 0 }).success).toBe(false);
    expect(platformSettingsSchemas.billing.safeParse({ trial_days: 400 }).success).toBe(false);
  });
});

describe("isSettingKey", () => {
  it("accepts known keys and rejects unknown ones", () => {
    expect(isSettingKey("platform")).toBe(true);
    expect(isSettingKey("bogus_key")).toBe(false);
  });
});
