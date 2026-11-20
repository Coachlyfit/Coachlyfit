import { describe, expect, it } from "vitest";
import { applicationSchema } from "./schema";

const ok = { name: "Sara", email: "s@example.com", phone: "+20 100 123 4567", goal: "lose_fat", activityLevel: "light" };

describe("applicationSchema", () => {
  it("accepts a minimal valid application", () => {
    expect(applicationSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects bad email, phone, goal", () => {
    expect(applicationSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...ok, phone: "abc" }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...ok, goal: "x" }).success).toBe(false);
  });
});
