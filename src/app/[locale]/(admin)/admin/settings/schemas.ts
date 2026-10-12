import { z } from "zod";

export const SETTINGS_TABS = ["general", "platform", "plans", "users", "audit"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const AUDIT_PAGE_SIZE = 50;

export const FEATURE_KEYS = [
  "forms_builder",
  "custom_library",
  "priority_support",
  "white_label",
  "custom_branding",
] as const;

export const tierSchema = z.object({
  id: z.string().uuid(),
  name_ar: z.string().trim().min(1).max(100),
  name_en: z.string().trim().min(1).max(100),
  price_egp_monthly: z.number().min(0),
  // null = no client cap (private.enforce_client_cap skips a null max).
  max_clients: z.number().int().min(1).nullable(),
  is_active: z.boolean(),
  forms_builder: z.boolean(),
  custom_library: z.boolean(),
  priority_support: z.boolean(),
  white_label: z.boolean(),
  custom_branding: z.boolean(),
});
export type TierInput = z.infer<typeof tierSchema>;

export const tiersSchema = z.array(tierSchema).min(1);

export const userRoleSchema = z.enum(["admin", "coach", "client"]);

export const userProfileSchema = z.object({
  fullName: z.string().trim().max(100),
  phone: z.string().trim().max(30),
});

export const userEmailSchema = z.string().trim().toLowerCase().email().max(255);
