import { z } from "zod";

/** One zod schema per platform_settings.key. Adding a new setting means
 * adding a key here (and a default below) -- no migration needed, the
 * table is jsonb key/value. */
export const platformSettingsSchemas = {
  platform: z.object({
    maintenance_mode: z.boolean(),
    signups_enabled: z.boolean(),
  }),
  branding: z.object({
    app_name_ar: z.string().min(1),
    app_name_en: z.string().min(1),
    support_email: z.string().email(),
  }),
  announcement: z.object({
    enabled: z.boolean(),
    text_ar: z.string(),
    text_en: z.string(),
  }),
  billing: z.object({
    trial_days: z.number().int().min(1).max(365),
  }),
} as const;

export type SettingKey = keyof typeof platformSettingsSchemas;

export type PlatformSettings = {
  [K in SettingKey]: z.infer<(typeof platformSettingsSchemas)[K]>;
};

export const SETTINGS_DEFAULTS: PlatformSettings = {
  platform: { maintenance_mode: false, signups_enabled: true },
  branding: {
    app_name_ar: "كوتشلي فِت",
    app_name_en: "Coachlyfit",
    support_email: "hello@coachlyfit.com",
  },
  announcement: { enabled: false, text_ar: "", text_en: "" },
  billing: { trial_days: 14 },
};

export function isSettingKey(key: string): key is SettingKey {
  return key in platformSettingsSchemas;
}
