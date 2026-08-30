import { describe, expect, it } from "vitest";
import { slugifyMetricKey } from "./metric-definitions";

describe("slugifyMetricKey", () => {
  it("lowercases and keeps a simple word as-is", () => {
    expect(slugifyMetricKey("Shoulder")).toBe("shoulder");
  });

  it("joins multiple words with a single underscore", () => {
    expect(slugifyMetricKey("Neck Circumference")).toBe("neck_circumference");
  });

  it("collapses punctuation and repeated separators, trims leading/trailing underscores", () => {
    expect(slugifyMetricKey("  Left  Bicep!! ")).toBe("left_bicep");
  });

  it("keeps digits", () => {
    expect(slugifyMetricKey("Calf 2nd measure")).toBe("calf_2nd_measure");
  });

  it("caps length at 50 characters", () => {
    const long = "a".repeat(80);
    expect(slugifyMetricKey(long).length).toBe(50);
  });
});
