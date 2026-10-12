import { describe, expect, it } from "vitest";
import { detectLocale } from "./detect-locale";

describe("detectLocale", () => {
  it("prefers the URL segment", () => {
    expect(detectLocale("/en/clients", "NEXT_LOCALE=ar")).toBe("en");
  });
  it("falls back to the cookie", () => {
    expect(detectLocale("/", "a=1; NEXT_LOCALE=en; b=2")).toBe("en");
  });
  it("defaults to ar", () => {
    expect(detectLocale("/fr/x", "")).toBe("ar");
  });
});
