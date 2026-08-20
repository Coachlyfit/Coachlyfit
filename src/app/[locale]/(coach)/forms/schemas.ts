import { z } from "zod";
import { FORM_KINDS } from "@/domain/forms/schema";

export const createTemplateSchema = z.object({
  kind: z.enum(FORM_KINDS),
  name_ar: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const assignFormSchema = z.object({
  clientId: z.string().uuid(),
  dueAt: z.string().optional(),
});

export type AssignFormInput = z.infer<typeof assignFormSchema>;
