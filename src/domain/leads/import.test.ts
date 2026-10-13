import { describe, expect, it } from "vitest";
import { parseLeadsCsv } from "./import";

describe("parseLeadsCsv", () => {
  it("skips the header and blank lines and lowercases the address", () => {
    const rows = parseLeadsCsv("email,name,source\n\n Sara@Example.com , Sara ,instagram\r\nali@example.com");
    expect(rows).toEqual([
      { email: "sara@example.com", name: "Sara", source: "instagram", state: "ok" },
      { email: "ali@example.com", name: null, source: null, state: "ok" },
    ]);
  });

  it("marks bad addresses and repeats instead of dropping them", () => {
    const rows = parseLeadsCsv("a@example.com\nnot-an-email\nA@example.com");
    expect(rows.map((row) => row.state)).toEqual(["ok", "invalid", "duplicate"]);
  });
});
