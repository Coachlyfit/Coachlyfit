import { describe, expect, it } from "vitest";
import { pickLocale, pickBilingual } from "./locale";

describe("pickLocale", () => {
  it("picks the field for the requested locale", () => {
    const row = { name_ar: "فول", name_en: "Ful" };
    expect(pickLocale(row, "ar")).toBe("فول");
    expect(pickLocale(row, "en")).toBe("Ful");
  });

  it("falls back to the other locale when the preferred one is empty", () => {
    expect(pickLocale({ name_ar: "", name_en: "Custom" }, "ar")).toBe("Custom");
    expect(pickLocale({ name_ar: "مخصص", name_en: "" }, "en")).toBe("مخصص");
  });

  it("supports a custom field prefix", () => {
    const row = { label_ar: "تسمية", label_en: "Label" };
    expect(pickLocale(row, "ar", "label")).toBe("تسمية");
  });
});

describe("pickBilingual", () => {
  it("picks the requested locale from an { ar, en } pair", () => {
    expect(pickBilingual({ ar: "تسمية", en: "Label" }, "ar")).toBe("تسمية");
    expect(pickBilingual({ ar: "تسمية", en: "Label" }, "en")).toBe("Label");
  });

  it("falls back to the other locale when the preferred one is empty", () => {
    expect(pickBilingual({ ar: "", en: "Label" }, "ar")).toBe("Label");
    expect(pickBilingual({ ar: "تسمية", en: "" }, "en")).toBe("تسمية");
  });
});
