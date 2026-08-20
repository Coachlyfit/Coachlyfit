import { z } from "zod";

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
