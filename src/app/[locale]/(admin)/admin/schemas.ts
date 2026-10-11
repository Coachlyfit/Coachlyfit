import { z } from "zod";

export const recordPaymentSchema = z.object({
  coachId: z.string().uuid(),
  amountEgp: z.coerce.number().positive(),
  method: z.enum(["instapay", "bank_transfer", "vodafone_cash", "cash"]),
  reference: z.string().max(100).optional(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

// z.coerce.number() makes the schema's input type (what RHF's number input
// hands it) diverge from its output type (post-validation) — see the same
// pattern in (coach)/library/schemas.ts.
export type RecordPaymentFormInput = z.input<typeof recordPaymentSchema>;
export type RecordPaymentInput = z.output<typeof recordPaymentSchema>;

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled"] as const;

export const updateSubscriptionSchema = z.object({
  coachId: z.string().uuid(),
  tierId: z.string().uuid(),
  status: z.enum(SUBSCRIPTION_STATUSES),
  // yyyy-mm-dd from the date picker; empty = leave the date as it is.
  periodEnd: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]),
  cancelAtPeriodEnd: z.boolean(),
});
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

export const resolveRequestSchema = z.object({
  requestId: z.string().uuid(),
  approve: z.boolean(),
  response: z.string().trim().max(1000),
});

export const coachNoteSchema = z.object({
  coachId: z.string().uuid(),
  note: z.string().trim().min(1).max(1000),
});
