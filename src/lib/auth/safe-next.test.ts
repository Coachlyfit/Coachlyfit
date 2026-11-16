import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("accepts locale-prefixed relative paths", () => {
    expect(safeNext("/ar/dashboard")).toBe("/ar/dashboard");
    expect(safeNext("/en/c")).toBe("/en/c");
    expect(safeNext("/en/join-team/abc123?x=1")).toBe("/en/join-team/abc123?x=1");
  });

  it.each([
    ["//evil.com"],
    ["//evil.com/ar/dashboard"],
    ["/\\evil.com"],
    ["/ar/\\evil.com"],
    ["https://evil.com"],
    ["http://evil.com/ar/dashboard"],
    ["javascript:alert(1)"],
    ["evil.com"],
    ["ar/dashboard"],
    ["/%2F%2Fevil.com"],
    ["/%5Cevil.com"],
    ["/\t/evil.com"],
    ["/\n/evil.com"],
    ["/%09/evil.com"],
    ["/fr/dashboard"],
    ["/dashboard"],
    ["/"],
    [""],
    ["/%E0%A4%A"],
  ])("rejects %j", (value) => {
    expect(safeNext(value)).toBeNull();
  });

  it("rejects nullish and non-string input", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(42 as unknown as string)).toBeNull();
  });

  it("rejects absurdly long input", () => {
    expect(safeNext(`/ar/${"a".repeat(3000)}`)).toBeNull();
  });
});
