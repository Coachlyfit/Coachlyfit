import { z } from "zod";
import { REASON_KEYS } from "@/domain/ledger/reasons";

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

// Mirrors Signal in domain/ledger/signals.ts, same reasoning as
// adjustmentSchema above — the service type has no runtime check of its
// own, so the evidence a client submits back (it's just their own review
// console's state, round-tripped) gets validated here before it's
// snapshotted onto coaching_decisions.evidence.
const signalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pain_repeat"),
    programItemId: z.string().uuid(),
    count: z.number().int().min(1),
    lastAt: z.string(),
    detail: z.object({ maxPain: z.number() }),
  }),
  z.object({
    kind: z.literal("missed_reps"),
    programItemId: z.string().uuid(),
    count: z.number().int().min(1),
    lastAt: z.string(),
    detail: z.object({ missed: z.number(), total: z.number() }),
  }),
  z.object({
    kind: z.literal("repeated_note"),
    count: z.number().int().min(1),
    lastAt: z.string(),
    detail: z.object({ notes: z.array(z.string()) }),
  }),
]);

export const reviewSchema = z.object({
  checkinId: z.string().uuid(),
  decision: z.enum(["keep", "adjust", "call"]),
  adjustments: z.array(adjustmentSchema).max(10).optional(),
  coachReply: z.string().trim().min(1).max(2000),
  reasonKey: z.enum(REASON_KEYS),
  clientNote: z.string().trim().min(1).max(280).optional(),
  evidence: z.array(signalSchema).max(10).optional(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
