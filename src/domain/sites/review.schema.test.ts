import { describe, expect, it } from "vitest";
import { reviewSchema } from "./review.schema";

const valid = { rating: 5, body: "Great coach, I stuck with the plan.", firstName: "Sara", sharePhotos: false };

describe("reviewSchema", () => {
  it("accepts a valid review", () => {
    expect(reviewSchema.safeParse(valid).success).toBe(true);
  });

  it("rating must be 1–5", () => {
    expect(reviewSchema.safeParse({ ...valid, rating: 0 }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...valid, rating: 6 }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...valid, rating: 3.5 }).success).toBe(false);
  });

  it("body is 20–500 characters after trimming", () => {
    expect(reviewSchema.safeParse({ ...valid, body: "too short" }).error?.issues[0].message).toBe("bodyShort");
    expect(reviewSchema.safeParse({ ...valid, body: "x".repeat(19) + "   " }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...valid, body: "x".repeat(500) }).success).toBe(true);
    expect(reviewSchema.safeParse({ ...valid, body: "x".repeat(501) }).error?.issues[0].message).toBe("bodyLong");
  });

  it("needs a first name", () => {
    expect(reviewSchema.safeParse({ ...valid, firstName: "  " }).error?.issues[0].message).toBe("name");
  });
});
