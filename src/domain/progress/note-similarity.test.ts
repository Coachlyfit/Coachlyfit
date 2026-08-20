import { describe, expect, it } from "vitest";
import { findSimilarNotes } from "./note-similarity";

describe("findSimilarNotes", () => {
  it("matches a note that echoes a prior week's complaint", () => {
    const result = findSimilarNotes("الركبة الشمال لسه بتوجع شوية في السكوات", [
      { checkin_date: "2026-07-20", notes: "الركبة الشمال بتوجعني بعد السكوات" },
      { checkin_date: "2026-07-13", notes: "حاسة بشد في الركبة" },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].checkin_date).toBe("2026-07-20");
  });

  it("does not match unrelated notes", () => {
    const result = findSimilarNotes("خلصت الأسبوع كويس، مفيش مشاكل", [
      { checkin_date: "2026-07-20", notes: "الأكل صعب أوصله في أيام الشغل" },
    ]);

    expect(result).toEqual([]);
  });

  it("ignores prior notes with no text", () => {
    const result = findSimilarNotes("الركبة بتوجعني", [{ checkin_date: "2026-07-20", notes: null }]);

    expect(result).toEqual([]);
  });

  it("returns an empty array when the current note has no meaningful tokens", () => {
    const result = findSimilarNotes("بس", [{ checkin_date: "2026-07-20", notes: "الركبة بتوجعني بعد السكوات" }]);

    expect(result).toEqual([]);
  });

  it("caps results at max and sorts by score", () => {
    const result = findSimilarNotes("الركبة الشمال بتوجعني بعد السكوات", [
      { checkin_date: "2026-07-06", notes: "الركبة بتوجعني شوية" },
      { checkin_date: "2026-07-13", notes: "الركبة الشمال بتوجعني بعد السكوات تماما" },
      { checkin_date: "2026-07-20", notes: "الركبة الشمال بتوجعني شوية بعد السكوات" },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].checkin_date).toBe("2026-07-20");
  });
});
