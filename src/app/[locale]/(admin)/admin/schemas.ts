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
