import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECTION_ORDER,
  moveVisibleSection,
  normalizeSectionOrder,
  reorderVisibleSections,
  sortItemsBySections,
} from "./day-sections";

describe("normalizeSectionOrder", () => {
  it("keeps a valid stored order as-is", () => {
    expect(normalizeSectionOrder(["mobility_rehab", "workout", "activities"])).toEqual([
      "mobility_rehab",
      "workout",
      "activities",
    ]);
  });

  it("appends known sections missing from an older row, in the default order", () => {
    expect(normalizeSectionOrder(["mobility_rehab"])).toEqual(["mobility_rehab", "workout", "activities"]);
  });

  it("drops duplicates and unknown keys, and handles null/undefined", () => {
    expect(normalizeSectionOrder(["workout", "workout", "legacy"])).toEqual([
      "workout",
      "mobility_rehab",
      "activities",
    ]);
    expect(normalizeSectionOrder(null)).toEqual([...DEFAULT_SECTION_ORDER]);
    expect(normalizeSectionOrder(undefined)).toEqual([...DEFAULT_SECTION_ORDER]);
  });
});

describe("reorderVisibleSections", () => {
  it("puts visible sections in the new order", () => {
    expect(reorderVisibleSections(DEFAULT_SECTION_ORDER, ["mobility_rehab", "workout"])).toEqual([
      "mobility_rehab",
      "workout",
      "activities",
    ]);
  });

  it("leaves a hidden section in the slot it already occupied", () => {
    // activities is empty on this day, so it isn't dragged — it must keep the
    // last slot while workout/mobility swap around it.
    expect(
      reorderVisibleSections(["workout", "mobility_rehab", "activities"], ["mobility_rehab", "workout"])
    ).toEqual(["mobility_rehab", "workout", "activities"]);
  });
});

describe("moveVisibleSection", () => {
  it("swaps with the next visible section", () => {
    expect(
      moveVisibleSection(DEFAULT_SECTION_ORDER, ["workout", "mobility_rehab"], "mobility_rehab", -1)
    ).toEqual(["mobility_rehab", "workout", "activities"]);
  });

  it("returns null at either end", () => {
    expect(moveVisibleSection(DEFAULT_SECTION_ORDER, ["workout", "mobility_rehab"], "workout", -1)).toBeNull();
    expect(
      moveVisibleSection(DEFAULT_SECTION_ORDER, ["workout", "mobility_rehab"], "mobility_rehab", 1)
    ).toBeNull();
  });
});

describe("sortItemsBySections", () => {
  const items = [
    { id: "warmup", block: "warmup" },
    { id: "main", block: "main" },
    { id: "mobility", block: "mobility" },
    { id: "rehab", block: "rehab" },
  ];

  it("groups mobility/rehab before workout when Mobility & rehab is first", () => {
    expect(sortItemsBySections(items, ["mobility_rehab", "workout"]).map((i) => i.id)).toEqual([
      "mobility",
      "rehab",
      "warmup",
      "main",
    ]);
  });

  it("preserves the existing order inside each section", () => {
    expect(sortItemsBySections(items, DEFAULT_SECTION_ORDER).map((i) => i.id)).toEqual([
      "warmup",
      "main",
      "mobility",
      "rehab",
    ]);
  });
});
