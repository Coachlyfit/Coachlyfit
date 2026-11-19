import { describe, expect, it } from "vitest";
import { initialOf, toDisplayName } from "./display-name";

describe("toDisplayName", () => {
  it("first name + last initial", () => {
    expect(toDisplayName("Sara Mahmoud")).toBe("Sara M.");
  });

  it("works in Arabic", () => {
    expect(toDisplayName("سارة محمود")).toBe("سارة م.");
  });

  it("uses the last word of a long name", () => {
    expect(toDisplayName("Abdelrahman Mohamed El-Shennawy")).toBe("Abdelrahman E.");
  });

  it("keeps a single name and ignores extra whitespace", () => {
    expect(toDisplayName("  Karim ")).toBe("Karim");
    expect(toDisplayName("Sara    Mahmoud")).toBe("Sara M.");
    expect(toDisplayName("   ")).toBe("");
  });
});

describe("initialOf", () => {
  it("takes the first letter in either script", () => {
    expect(initialOf("sara")).toBe("S");
    expect(initialOf("سارة")).toBe("س");
    expect(initialOf("")).toBe("");
  });
});
