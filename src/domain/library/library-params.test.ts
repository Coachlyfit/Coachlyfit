import { describe, expect, it } from "vitest";
import { DEFAULT_LIBRARY_PARAMS, parseLibraryParams, serializeLibraryParams } from "./library-params";

describe("library params", () => {
  it("an empty query string is the default view, and serializes back to nothing", () => {
    expect(parseLibraryParams(new URLSearchParams())).toEqual(DEFAULT_LIBRARY_PARAMS);
    expect(serializeLibraryParams(DEFAULT_LIBRARY_PARAMS)).toBe("");
  });

  it("round-trips a fully filtered state", () => {
    const state = {
      tab: "foods",
      view: "card",
      q: "rice",
      source: "mine",
      group: "legs",
      cat: "carbs",
      equip: "body weight",
      sort: "kcal",
      tag: "high protein",
      page: 3,
    } as const;
    expect(parseLibraryParams(new URLSearchParams(serializeLibraryParams(state)))).toEqual(state);
  });

  it("drops anything that isn't on a whitelist instead of passing it through", () => {
    const parsed = parseLibraryParams(
      new URLSearchParams("tab=admin&view=grid&source=theirs&group=toes&cat=candy&equip=Machine&sort=spicy&tag=%20%20&page=-2")
    );
    expect(parsed).toEqual(DEFAULT_LIBRARY_PARAMS);
  });

  it("rejects non-integer pages and caps the search term", () => {
    expect(parseLibraryParams(new URLSearchParams("page=2.5")).page).toBe(1);
    expect(parseLibraryParams(new URLSearchParams("page=abc")).page).toBe(1);
    expect(parseLibraryParams(new URLSearchParams(`q=${"a".repeat(500)}`)).q).toHaveLength(100);
  });

  it("caps a recipe tag at the DB's 24 characters", () => {
    expect(parseLibraryParams(new URLSearchParams(`tab=recipes&tag=${"x".repeat(40)}`))).toMatchObject({
      tab: "recipes",
      tag: "x".repeat(24),
    });
  });
});
