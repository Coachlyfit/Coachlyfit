import { z } from "zod";
import { OBSERVATION_CATEGORIES, OBSERVATION_LINK_TYPES, OBSERVATION_SEVERITIES } from "@/domain/clients/observations";

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

export const observationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.enum(OBSERVATION_CATEGORIES),
  severity: z.enum(OBSERVATION_SEVERITIES).nullable(),
  details: z.string().trim().max(2000),
  linked: z.object({ type: z.enum(OBSERVATION_LINK_TYPES), id: z.string().uuid() }).nullable(),
  // Path shape (coach/client prefix, extension) is re-checked in the action.
  image_path: z.string().max(300).nullable(),
});

export type ObservationInput = z.infer<typeof observationSchema>;

export const updateClientSchema = z.object({
  displayName: z.string().min(2).max(100),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(6).max(30).optional().or(z.literal("")),
});

export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// Same bounds as the client's own signup (join/[token]/schemas.ts); 72 is
// bcrypt's input limit.
const clientPassword = z.string().min(8).max(72);

// Activating a client with no account needs an email to log in with
// (prefilled from the roster row). Confirming an existing unconfirmed signup
// needs neither field — the password is then an optional override.
export const activateClientSchema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  password: clientPassword.optional().or(z.literal("")),
});

export type ActivateClientInput = z.infer<typeof activateClientSchema>;

export const setClientPasswordSchema = z.object({
  password: clientPassword,
});

export type SetClientPasswordInput = z.infer<typeof setClientPasswordSchema>;
