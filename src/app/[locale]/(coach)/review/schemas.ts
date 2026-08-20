import { z } from "zod";

export const reviewSchema = z.object({
  checkinId: z.string().uuid(),
  decision: z.enum(["keep", "adjust", "call"]),
  adjustments: z.array(z.string().max(200)).max(10).optional(),
  coachReply: z.string().trim().min(1).max(2000),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
