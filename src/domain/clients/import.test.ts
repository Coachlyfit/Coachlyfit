import { describe, expect, it } from "vitest";
import { parseRoster, guessFields, toInvites } from "./import";

// Verbatim sample from the onboarding prototype (tab-separated, Arabic
// names, Egyptian mobile numbers, a free-text goal column, a numeric fee).
const SAMPLE = [
  "سارة عبد الرحمن\t01001234567\tنزول وزن\t1500",
  "أحمد فؤاد\t01122334455\tبناء عضل\t1800",
  "نور الشاذلي\t01099887766\tلياقة عامة\t1200",
  "كريم منصور\t01055443322\tنزول وزن\t1500",
  "يارا حسن\t01277889900\tما بعد الولادة\t2000",
].join("\n");

describe("parseRoster", () => {
  it("splits the prototype's tab-separated sample into 5 rows of 4 columns", () => {
    const rows = parseRoster(SAMPLE);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.length === 4)).toBe(true);
    expect(rows[0]).toEqual(["سارة عبد الرحمن", "01001234567", "نزول وزن", "1500"]);
  });

  it("handles comma-separated input", () => {
    const rows = parseRoster("Alice,01001234567,1500\nBob,01122334455,1800");
    expect(rows).toEqual([
      ["Alice", "01001234567", "1500"],
      ["Bob", "01122334455", "1800"],
    ]);
  });

  it("handles runs-of-spaces input", () => {
    const rows = parseRoster("Alice    01001234567    1500");
    expect(rows).toEqual([["Alice", "01001234567", "1500"]]);
  });

  it("drops blank lines and trims ragged whitespace", () => {
    const rows = parseRoster("\n  Alice\t01001234567  \n\n\nBob\t01122334455\n");
    expect(rows).toEqual([
      ["Alice", "01001234567"],
      ["Bob", "01122334455"],
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseRoster("")).toEqual([]);
    expect(parseRoster("   \n  \n")).toEqual([]);
  });
});

describe("guessFields", () => {
  it("guesses name/phone/skip/fee for the prototype sample", () => {
    const rows = parseRoster(SAMPLE);
    expect(guessFields(rows)).toEqual(["name", "phone", "skip", "fee"]);
  });

  it("guesses the first unclaimed text column as name even when phone comes first", () => {
    const rows = [
      ["01001234567", "Alice"],
      ["01122334455", "Bob"],
    ];
    expect(guessFields(rows)).toEqual(["phone", "name"]);
  });

  it("handles ragged rows (missing trailing columns)", () => {
    const rows = [
      ["Alice", "01001234567", "1500"],
      ["Bob", "01122334455"],
    ];
    expect(guessFields(rows)).toEqual(["name", "phone", "fee"]);
  });
});

describe("toInvites", () => {
  it("maps the prototype sample to invite inputs", () => {
    const rows = parseRoster(SAMPLE);
    const fields = guessFields(rows);
    const invites = toInvites(rows, fields);

    expect(invites).toHaveLength(5);
    expect(invites[0]).toEqual({ displayName: "سارة عبد الرحمن", phone: "01001234567" });
    expect(invites[4]).toEqual({ displayName: "يارا حسن", phone: "01277889900" });
  });

  it("drops rows with no usable name", () => {
    const rows = [
      ["", "01001234567"],
      ["Bob", "01122334455"],
    ];
    const invites = toInvites(rows, ["name", "phone"]);
    expect(invites).toEqual([{ displayName: "Bob", phone: "01122334455" }]);
  });

  it("omits phone when no column is mapped to it", () => {
    const invites = toInvites([["Alice", "01001234567"]], ["name", "skip"]);
    expect(invites).toEqual([{ displayName: "Alice", phone: undefined }]);
  });
});
