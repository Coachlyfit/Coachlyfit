import { z } from "zod";
import { REQUEST_TYPES } from "@/domain/billing/coach-subscription.service";

export const subscriptionRequestSchema = z
  .object({
    type: z.enum(REQUEST_TYPES),
    tierId: z.string().uuid().optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((d) => d.type !== "change_plan" || !!d.tierId, { path: ["tierId"] })
  // "Other" says nothing by itself, so it needs the note.
  .refine((d) => d.type !== "other" || !!d.note, { path: ["note"] });

export type SubscriptionRequestInput = z.infer<typeof subscriptionRequestSchema>;
