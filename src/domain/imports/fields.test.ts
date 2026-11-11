import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import { FIELDS, applyMapping, autoMap, canContinue, parseSheetUrl, sheetExportUrl, validateRows } from "./fields";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

describe("autoMap", () => {
  it("matches Arabic headers, tolerating hamza/ta-marbuta/diacritics", () => {
    const m = autoMap(["الاسم", "رقم الهاتف", "البريد الإلكتروني"], "clients");
    expect(m).toEqual({ displayName: 0, phone: 1, email: 2 });
  });

  it("matches English headers case-insensitively and leaves unknown columns unmapped", () => {
    const m = autoMap(["Notes", "EMAIL", "Name", "Phone"], "clients");
    expect(m).toEqual({ displayName: 2, email: 1, phone: 3 });
  });

  it("gives an exact alias priority over a contains match and never claims a column twice", () => {
    // "Name" is an exact alias for name_en; "Name AR" must go to name_ar.
    const m = autoMap(["Name AR", "Name"], "exercises");
    expect(m.name_ar).toBe(0);
    expect(m.name_en).toBe(1);
  });
});

describe("canContinue", () => {
  it("clients need a name column", () => {
    expect(canContinue("clients", { displayName: null, email: 1, phone: null })).toBe(false);
    expect(canContinue("clients", { displayName: 0, email: null, phone: null })).toBe(true);
  });
  it("exercises need at least one of the two names", () => {
    expect(canContinue("exercises", { name_ar: null, name_en: null })).toBe(false);
    expect(canContinue("exercises", { name_ar: null, name_en: 0 })).toBe(true);
  });
});

describe("parseSheetUrl", () => {
  it("extracts id and gid from query or hash, defaulting gid to 0", () => {
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=42#gid=42`)).toEqual({ id: ID, gid: "42" });
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=7`)).toEqual({ id: ID, gid: "7" });
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}`)).toEqual({ id: ID, gid: "0" });
  });

  it.each([
    ["wrong host", `https://evil.com/spreadsheets/d/${ID}/edit`],
    ["lookalike host", `https://docs.google.com.evil.com/spreadsheets/d/${ID}/edit`],
    ["userinfo trick", `https://docs.google.com@evil.com/spreadsheets/d/${ID}/edit`],
    ["http", `http://docs.google.com/spreadsheets/d/${ID}/edit`],
    ["published /d/e/ link", `https://docs.google.com/spreadsheets/d/e/2PACX-${ID}/pubhtml`],
    ["non-numeric gid", `https://docs.google.com/spreadsheets/d/${ID}/edit?gid=1/../x`],
    ["not a url", "docs.google.com/spreadsheets"],
    ["docs not sheets", `https://docs.google.com/document/d/${ID}/edit`],
  ])("rejects %s", (_name, url) => {
    expect(parseSheetUrl(url)).toBeNull();
  });

  it("builds the export URL from the parsed parts only", () => {
    expect(sheetExportUrl({ id: ID, gid: "5" })).toBe(
      `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=5`
    );
  });
});

describe("validateRows (clients)", () => {
  const rows = applyMapping(
    "clients",
    [
      ["Sara", "sara@x.com", "01012345678"],
      ["", "noname@x.com", ""],
      ["Bad Email", "not-an-email", ""],
      ["Bad Phone", "", "12"],
      ["Sara Again", "SARA@x.com", ""], // dup of row 0 by email
      ["Dup Phone", "", "010 1234 5678"], // dup of row 0 by phone digits
      ["Existing", "old@x.com", ""],
    ],
    { displayName: 0, email: 1, phone: 2 }
  );
  const res = validateRows("clients", rows, ["e:old@x.com"]);

  it("accepts a clean row", () => expect(res[0].ok).toBe(true));
  it("flags missing name", () => expect(res[1]).toEqual({ ok: false, errors: ["missing_required"] }));
  it("flags invalid email and phone", () => {
    expect(res[2]).toEqual({ ok: false, errors: ["invalid_email"] });
    expect(res[3]).toEqual({ ok: false, errors: ["invalid_phone"] });
  });
  it("flags duplicates inside the file (email case-insensitive, phone by digits) and against existing", () => {
    expect(res[4]).toEqual({ ok: false, errors: ["duplicate"] });
    expect(res[5]).toEqual({ ok: false, errors: ["duplicate"] });
    expect(res[6]).toEqual({ ok: false, errors: ["duplicate"] });
  });
  it("an invalid row does not shadow a later valid row with the same email", () => {
    const r = validateRows("clients", [{ displayName: "A", email: "z@x.com" }, { displayName: "Zed", email: "z@x.com" }], []);
    expect(r.map((x) => x.ok)).toEqual([false, true]); // "A" fails min length, so z@x.com stays free
  });
});

describe("validateRows (exercises)", () => {
  it("copies the one provided name into the other and keeps known muscle groups only", () => {
    const [a, b] = validateRows(
      "exercises",
      [
        { name_en: "Bench Press", muscle_group: "Chest" },
        { name_ar: "سكوات", muscle_group: "nonsense" },
      ],
      []
    );
    expect(a).toEqual({ ok: true, data: { name_en: "Bench Press", name_ar: "Bench Press", muscle_group: "chest" } });
    expect(b).toEqual({ ok: true, data: { name_ar: "سكوات", name_en: "سكوات" } });
  });

  it("maps translated muscle labels via the caller-supplied table", () => {
    const [r] = validateRows("exercises", [{ name_en: "Row", muscle_group: "الظهر" }], [], { الظهر: "back" });
    expect(r).toMatchObject({ ok: true, data: { muscle_group: "back" } });
  });

  it("skips names already in the library and repeats within the file", () => {
    const res = validateRows(
      "exercises",
      [{ name_en: "Deadlift" }, { name_en: "  deadlift " }, { name_en: "Squat" }, { name_en: "SQUAT" }],
      ["n:deadlift"]
    );
    expect(res.map((r) => r.ok)).toEqual([false, false, true, false]);
  });

  it("rejects a bad video url", () => {
    const [r] = validateRows("exercises", [{ name_en: "Curl", video_url: "not a url" }], []);
    expect(r).toEqual({ ok: false, errors: ["invalid"] });
  });
});

describe("template headers round-trip through autoMap", () => {
  // The downloaded template uses the localized field labels as headers; a
  // coach re-importing it must get every column mapped without touching a thing.
  it.each([
    ["en", en],
    ["ar", ar],
  ])("%s", (_locale, messages) => {
    for (const type of ["clients", "exercises"] as const) {
      const keys = FIELDS[type].map((f) => f.key);
      const headers = keys.map((k) => (messages.imports.fields as Record<string, string>)[k]);
      const mapping = autoMap(headers, type);
      expect(mapping, `${type}/${_locale}`).toEqual(Object.fromEntries(keys.map((k, i) => [k, i])));
    }
  });
});
