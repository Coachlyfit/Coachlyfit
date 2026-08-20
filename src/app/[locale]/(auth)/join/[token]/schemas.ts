import { z } from "zod";

export const joinSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

export type JoinInput = z.infer<typeof joinSchema>;
