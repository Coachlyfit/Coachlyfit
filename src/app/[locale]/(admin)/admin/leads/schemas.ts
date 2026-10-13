import { z } from "zod";
import { LEAD_STATUSES } from "@/domain/leads/leads.service";

// Optional text fields stay strings in the form; the action stores "" as null.
export const leadSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  fullName: z.string().trim().max(100),
  source: z.string().trim().max(50),
  locale: z.enum(["ar", "en"]),
  notes: z.string().trim().max(2000),
});
export type LeadFormInput = z.infer<typeof leadSchema>;

export const leadIdSchema = z.string().uuid();
export const leadStatusSchema = z.enum(LEAD_STATUSES);

/** Rows the import dialog already parsed and marked `ok`. Checked again here:
 * the action is reachable without the dialog. */
export const importSchema = z
  .array(
    z.object({
      email: z.string().trim().toLowerCase().email().max(320),
      name: z.string().trim().max(100).nullable(),
      source: z.string().trim().max(50).nullable(),
    })
  )
  .min(1)
  .max(500);
