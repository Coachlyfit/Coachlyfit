import { z } from "zod";
import { FORM_KINDS } from "@/domain/forms/schema";

export const createTemplateSchema = z.object({
  kind: z.enum(FORM_KINDS),
  name_ar: z.string().trim().min(1).max(100),
  // Optional: stored as "" and pickLocale falls back to the Arabic name.
  name_en: z.string().trim().max(100),
  /** Start from the kind's suggested questions instead of an empty form. */
  starter: z.boolean(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const assignFormSchema = z.object({
  clientId: z.string().uuid(),
  dueAt: z.string().optional(),
});

export type AssignFormInput = z.infer<typeof assignFormSchema>;
