import { z } from "zod";

// Mirrors StructuredAdjustment in review.service.ts — kept as a separate
// zod schema (not z.infer'd from the service type) because the service
// type is a plain discriminated union with no runtime validation of its
// own; this is the one place that boundary gets checked.
export const adjustmentSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("reduceLoad"), percent: z.number().int().min(1).max(100), itemIds: z.array(z.string().uuid()) }),
  z.object({ key: z.literal("removeMovement"), itemIds: z.array(z.string().uuid()) }),
  z.object({ key: z.literal("extraWarmup") }),
  z.object({ key: z.literal("extraRestDay") }),
]);

export const reviewSchema = z.object({
  checkinId: z.string().uuid(),
  decision: z.enum(["keep", "adjust", "call"]),
  adjustments: z.array(adjustmentSchema).max(10).optional(),
  coachReply: z.string().trim().min(1).max(2000),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
