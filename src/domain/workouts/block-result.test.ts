import { describe, expect, it } from "vitest";
import { parseBlockResults, toBlockScoreRows } from "./block-result";

describe("parseBlockResults", () => {
  it("keeps well-formed results", () => {
    expect(
      parseBlockResults({ g1: { kind: "amrap", rounds: 5, extra_reps: 3, rx: true }, g2: { kind: "for_time", time_s: 420, splits_s: [140, 140, 140] } })
    ).toEqual({
      g1: { kind: "amrap", rounds: 5, extra_reps: 3, rx: true },
      g2: { kind: "for_time", time_s: 420, splits_s: [140, 140, 140] },
    });
  });

  it("drops unknown kinds, bad numbers and non-objects", () => {
    expect(parseBlockResults({ a: { kind: "bogus", rounds: 1 }, b: "x", c: { kind: "emom", rounds: -2, extra_reps: NaN } })).toEqual({
      c: { kind: "emom" },
    });
  });

  it("returns {} for non-object input", () => {
    expect(parseBlockResults(null)).toEqual({});
    expect(parseBlockResults([1])).toEqual({});
  });
});

describe("toBlockScoreRows", () => {
  const session = (id: string, started_at: string, block_results: unknown, label: string | null = null) => ({
    id,
    started_at,
    block_results,
    program_days: label ? { label_ar: null, label_en: label } : null,
  });

  it("flattens scores newest first, skips sessions without any, and limits", () => {
    const rows = toBlockScoreRows(
      [
        session("a", "2026-11-01T10:00:00Z", { g1: { kind: "amrap", rounds: 5 } }, "WOD"),
        session("b", "2026-11-03T10:00:00Z", {}),
        session("c", "2026-11-05T10:00:00Z", { g2: { kind: "for_time", time_s: 600 }, g3: { kind: "emom", rounds: 10 } }),
      ],
      2
    );
    expect(rows.map((r) => [r.sessionId, r.groupKey])).toEqual([
      ["c", "g2"],
      ["c", "g3"],
    ]);
    expect(toBlockScoreRows([session("a", "2026-11-01T10:00:00Z", { g1: { kind: "amrap", rounds: 5 } }, "WOD")])[0].dayLabel).toEqual({
      name_ar: "WOD",
      name_en: "WOD",
    });
  });
});
