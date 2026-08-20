import { describe, expect, it } from "vitest";
import { libraryErrorKey } from "./errors";

describe("libraryErrorKey", () => {
  it.each([
    ["23503", "in_use"],
    ["42501", "forbidden"],
    ["22023", "already_global"],
    // exercises_coach_source_uniq / foods_coach_source_uniq
    // (20260805000001_library_clone.sql) — a coach re-cloning a global.
    ["23505", "already_cloned"],
    ["99999", "unknown"],
  ])("maps Postgres code %s to %s", (code, key) => {
    expect(libraryErrorKey({ code })).toBe(key);
  });

  it("falls back to unknown for a non-Postgres error", () => {
    expect(libraryErrorKey(new Error("boom"))).toBe("unknown");
    expect(libraryErrorKey(null)).toBe("unknown");
  });
});
