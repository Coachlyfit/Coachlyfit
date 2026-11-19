import { z } from "zod";

export const REVIEW_BODY_MIN = 20;
export const REVIEW_BODY_MAX = 500;
export const FIRST_NAME_MAX = 40;

// Error messages are i18n keys under clientReview.errors.* — the form maps them.
export const reviewSchema = z.object({
  rating: z.number().int().min(1, "rating").max(5, "rating"),
  body: z.string().trim().min(REVIEW_BODY_MIN, "bodyShort").max(REVIEW_BODY_MAX, "bodyLong"),
  firstName: z.string().trim().min(1, "name").max(FIRST_NAME_MAX, "name"),
  sharePhotos: z.boolean(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
