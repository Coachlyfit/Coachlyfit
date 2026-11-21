import { describe, expect, it } from "vitest";
import { mealVisual } from "./meal-visual";

describe("mealVisual", () => {
  it("picks by time of day", () => {
    expect(mealVisual("08:00", 3).emoji).toBe("☀️");
    expect(mealVisual("13:00", 0).emoji).toBe("🌤️");
    expect(mealVisual("16:30", 0).emoji).toBe("🍎");
    expect(mealVisual("20:00", 0).emoji).toBe("🌙");
  });

  it("falls back to position, cycling, when there is no time", () => {
    expect(mealVisual(null, 0).emoji).toBe("☀️");
    expect(mealVisual(null, 2).emoji).toBe("🍎");
    expect(mealVisual(null, 4).emoji).toBe("☀️");
  });
});
