import { z } from "zod";

export const checkinSchema = z.object({
  checkin_date: z.string(),
  weight: z.coerce.number().positive().optional(),
  mood: z.coerce.number().int().min(1).max(5).optional(),
  energy: z.coerce.number().int().min(1).max(5).optional(),
  adherence: z.coerce.number().int().min(0).max(100).optional(),
  sleep_hours: z.coerce.number().min(0).max(24).optional(),
  notes: z.string().max(1000).optional(),
});

export type CheckinFormInput = z.input<typeof checkinSchema>;
export type CheckinInput = z.output<typeof checkinSchema>;
