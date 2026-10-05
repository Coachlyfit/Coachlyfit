import { z } from "zod";

// Roster status filter (?status=). Lives here, not in clients-table.tsx: the
// server page validates the query param against it, and a value imported
// from a "use client" module is only a reference on the server.
export const STATUS_FILTERS = ["all", "active", "late", "awaiting"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

// .or(z.literal("")): RHF reports an untouched optional text input as ""
// (not undefined), so the empty string must validate on the client too.
// The server action then normalizes "" | null -> undefined before this
// ever reaches InvitesService, which expects a clean `string | undefined`.
export const createInviteSchema = z.object({
  displayName: z.string().min(2).max(100),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(6).max(30).optional().or(z.literal("")),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const createSubscriptionSchema = z.object({
  package_id: z.string().uuid(),
  end_date: z.string().min(1),
});

export const recordTransactionSchema = z.object({
  subscription_id: z.string().uuid(),
  payment_method_id: z.string().uuid(),
  amount_egp: z.coerce.number().positive(),
  transaction_date: z.string().optional().or(z.literal("")),
  proof_path: z.string().optional().or(z.literal("")),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
// z.coerce.number() makes the schema's input type (what RHF's number input
// actually hands it, pre-validation) diverge from its output type — same
// split as programs/schemas.ts's ItemFormInput/ItemInput.
export type RecordTransactionFormInput = z.input<typeof recordTransactionSchema>;
export type RecordTransactionInput = z.output<typeof recordTransactionSchema>;

export const createObservationSchema = z.object({
  body: z.string().min(1).max(1000),
});

export type CreateObservationInput = z.infer<typeof createObservationSchema>;

export const updateClientSchema = z.object({
  displayName: z.string().min(2).max(100),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(6).max(30).optional().or(z.literal("")),
});

export type UpdateClientInput = z.infer<typeof updateClientSchema>;
