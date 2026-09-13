import { z } from "zod";

export const tierSchema = z.object({
  name_ar: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  price_egp_monthly: z.coerce.number().min(0),
  max_clients: z.coerce.number().int().min(1),
  is_active: z.coerce.boolean(),
  forms_builder: z.coerce.boolean(),
  custom_library: z.coerce.boolean(),
  priority_support: z.coerce.boolean(),
  white_label: z.coerce.boolean(),
});
export type TierInput = z.input<typeof tierSchema>;

export const userRoleSchema = z.enum(["admin", "coach", "client"]);
