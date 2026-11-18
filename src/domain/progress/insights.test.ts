import { describe, expect, it } from "vitest";
import type { Signal } from "@/domain/ledger/signals";
import { buildInsights, type Insight } from "./insights";

type Reading = Parameters<typeof buildInsights>[0];

function reading(checkin_date: string, overrides: Partial<Reading> = {}): Reading {
  return { checkin_date, weight: null, sleep_hours: null, adherence: null, ...overrides };
}

const NOW = new Date("2026-08-01T12:00:00Z");
const CURRENT_DATE = "2026-07-31";
const painSignal: Signal = {
  kind: "pain_repeat",
  programItemId: "item-1",
  count: 2,
  lastAt: "2026-07-30T10:00:00Z",
  detail: { maxPain: 3 },
};

/** `n` days before CURRENT_DATE as YYYY-MM-DD. */
function daysBefore(n: number, from = CURRENT_DATE): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** A data-less check-in 3 days back: keeps `missed_checkins` quiet in tests
 * that put a lone reading 10+ days back for another rule. */
const FILLER = reading(daysBefore(3));

function keys(insights: Insight[]): string[] {
  return insights.map((i) => i.key);
}

function run(current: Partial<Reading>, history: Reading[] = [], signals: Signal[] = [], now = NOW) {
  return buildInsights(reading(CURRENT_DATE, current), history, signals, now);
}

describe("buildInsights — weight_stalled", () => {
  const stalled = (gap: number, prev: number, now: number) =>
    run({ weight: now }, [reading(daysBefore(gap), { weight: prev }), FILLER]);

  it("fires with <0.3 kg change across a 14-day window", () => {
    const [insight] = stalled(14, 80, 80.1);
    expect(insight).toMatchObject({ key: "weight_stalled", severity: "info", replyChip: "weightStalled" });
    expect(insight.params).toMatchObject({ weeks: 2, days: 14 });
  });

  it("fires for a 0.29 kg change but not for 0.3 (float-safe)", () => {
    expect(keys(stalled(14, 80, 80.29))).toContain("weight_stalled");
    expect(keys(stalled(14, 80, 80.3))).not.toContain("weight_stalled");
    expect(keys(stalled(14, 80.3, 80))).not.toContain("weight_stalled");
  });

  it("counts a loss the same as a gain", () => {
    expect(keys(stalled(14, 80, 79.8))).toContain("weight_stalled");
    expect(keys(stalled(14, 80, 78))).not.toContain("weight_stalled");
  });

  it("needs the reference reading 10-18 days back (inclusive)", () => {
    expect(keys(stalled(9, 80, 80))).not.toContain("weight_stalled");
    expect(keys(stalled(10, 80, 80))).toContain("weight_stalled");
    expect(keys(stalled(18, 80, 80))).toContain("weight_stalled");
    expect(keys(stalled(19, 80, 80))).not.toContain("weight_stalled");
  });

  it("uses the oldest reading inside the window", () => {
    const history = [reading(daysBefore(17), { weight: 80 }), reading(daysBefore(10), { weight: 85 })];
    const [insight] = run({ weight: 80.1 }, history);
    expect(insight).toMatchObject({ key: "weight_stalled" });
    expect(insight.params.days).toBe(17);
  });

  it("rounds weeks from the actual gap (10 days -> 1 week, 18 days -> 3 weeks)", () => {
    expect(stalled(10, 80, 80)[0].params.weeks).toBe(1);
    expect(stalled(18, 80, 80)[0].params.weeks).toBe(3);
  });

  it("is skipped when the current weight is missing", () => {
    expect(run({ weight: null }, [reading(daysBefore(14), { weight: 80 }), FILLER])).toEqual([]);
  });

  it("is skipped when no history reading has a weight", () => {
    expect(run({ weight: 80 }, [reading(daysBefore(14)), FILLER])).toEqual([]);
  });

  it("is skipped with empty history", () => {
    expect(run({ weight: 80 })).toEqual([]);
  });

  it("handles a month/year rollover without off-by-one", () => {
    const a = buildInsights(
      reading("2027-01-08", { weight: 80 }),
      [reading("2026-12-28", { weight: 80 }), reading("2027-01-04")],
      [],
      new Date("2027-01-09T00:00:00Z")
    );
    expect(a[0]).toMatchObject({ key: "weight_stalled" });
    expect(a[0].params.days).toBe(11);
  });
});

describe("buildInsights — sleep_drop", () => {
  const withSleep = (...hours: number[]) =>
    hours.map((h, i) => reading(daysBefore(7 * (hours.length - i)), { sleep_hours: h }));

  it("fires when sleep is >=1h below the average of the previous 4", () => {
    const [insight] = run({ sleep_hours: 5.5 }, withSleep(7, 7, 7, 7));
    expect(insight).toMatchObject({ key: "sleep_drop", severity: "warn", replyChip: "sleepDrop" });
    expect(insight.params).toMatchObject({ drop: 1.5, hours: 5.5, avg: 7 });
  });

  it("fires at exactly 1h, not at 0.9h (float-trap values)", () => {
    expect(keys(run({ sleep_hours: 6 }, withSleep(7, 7, 7, 7)))).toContain("sleep_drop");
    expect(keys(run({ sleep_hours: 5.1 }, withSleep(6.1, 6.1, 6.1, 6.1)))).toContain("sleep_drop");
    expect(keys(run({ sleep_hours: 6.1 }, withSleep(7, 7, 7, 7)))).not.toContain("sleep_drop");
  });

  it("does not fire when sleep rose", () => {
    expect(run({ sleep_hours: 9 }, withSleep(7, 7, 7, 7))).toEqual([]);
  });

  it("uses only the latest 4 rows with sleep", () => {
    // oldest two are 4h; only the latest four (8h) count
    const history = withSleep(4, 4, 8, 8, 8, 8);
    expect(keys(run({ sleep_hours: 7.5 }, history))).not.toContain("sleep_drop");
    expect(keys(run({ sleep_hours: 6.5 }, history))).toContain("sleep_drop");
  });

  it("skips prior rows without sleep instead of counting them as 0", () => {
    const history = [
      reading(daysBefore(28), { sleep_hours: 7 }),
      reading(daysBefore(21)),
      reading(daysBefore(14), { sleep_hours: 7 }),
      reading(daysBefore(7)),
    ];
    expect(keys(run({ sleep_hours: 5.5 }, history))).toContain("sleep_drop");
  });

  it("needs at least 2 prior readings with sleep", () => {
    expect(run({ sleep_hours: 3 }, withSleep(8))).toEqual([]);
    expect(keys(run({ sleep_hours: 3 }, withSleep(8, 8)))).toContain("sleep_drop");
  });

  it("is skipped when current sleep is missing", () => {
    expect(run({ sleep_hours: null }, withSleep(8, 8, 8, 8))).toEqual([]);
  });
});

describe("buildInsights — adherence_low", () => {
  const withAdherence = (...values: number[]) =>
    values.map((v, i) => reading(daysBefore(7 * (values.length - i)), { adherence: v }));

  it("fires below 70 even with no history", () => {
    const [insight] = run({ adherence: 60 });
    expect(insight).toMatchObject({ key: "adherence_low", severity: "warn", replyChip: "adherenceLow" });
    expect(insight.params).toMatchObject({ adherence: 60 });
  });

  it("is 69 -> fires, 70 -> does not", () => {
    expect(keys(run({ adherence: 69 }))).toContain("adherence_low");
    expect(keys(run({ adherence: 70 }))).not.toContain("adherence_low");
  });

  it("fires at >=15 points below baseline even above 70", () => {
    const history = withAdherence(90, 90, 90);
    expect(keys(run({ adherence: 75 }, history))).toContain("adherence_low");
    expect(keys(run({ adherence: 76 }, history))).not.toContain("adherence_low");
  });

  it("baseline uses only the last 6 prior rows and ignores null adherence", () => {
    const history = [
      reading(daysBefore(56), { adherence: 10 }),
      reading(daysBefore(49), { adherence: 10 }),
      reading(daysBefore(42)),
      ...[35, 28, 21, 14, 7].map((d) => reading(daysBefore(d), { adherence: 90 })),
    ];
    // last 6 rows = one null + five 90s -> baseline 90 (all 8 rows would give 67)
    expect(keys(run({ adherence: 75 }, history))).toContain("adherence_low");
  });

  it("is skipped when current adherence is missing", () => {
    expect(run({ adherence: null }, withAdherence(90, 90))).toEqual([]);
  });
});

describe("buildInsights — missed_checkins", () => {
  it("fires when the previous check-in is more than 10 days back", () => {
    const [insight] = run({}, [reading(daysBefore(11))]);
    expect(insight).toMatchObject({ key: "missed_checkins", severity: "warn", replyChip: "missedCheckins" });
    expect(insight.params).toMatchObject({ days: 11 });
  });

  it("does not fire at exactly 10 days", () => {
    expect(run({}, [reading(daysBefore(10))])).toEqual([]);
  });

  it("measures from the most recent prior check-in, regardless of input order", () => {
    const history = [reading(daysBefore(3)), reading(daysBefore(40))];
    expect(run({}, history)).toEqual([]);
  });

  it("is skipped on a first-ever check-in", () => {
    expect(run({})).toEqual([]);
  });

  it("is date-based: late-evening UTC `now` does not shift the gap", () => {
    const late = new Date("2026-07-31T23:59:59Z");
    expect(keys(run({}, [reading(daysBefore(11))], [], late))).toContain("missed_checkins");
    expect(run({}, [reading(daysBefore(10))], [], late)).toEqual([]);
  });
});

describe("buildInsights — pain", () => {
  it("fires from a pain_repeat signal and suggests the call chip", () => {
    const [insight] = run({}, [], [painSignal]);
    expect(insight).toMatchObject({ key: "pain", severity: "warn", replyChip: "call" });
    expect(insight.params).toMatchObject({ count: 1 });
  });

  it("counts exercises, one per pain_repeat signal", () => {
    const [insight] = run({}, [], [painSignal, { ...painSignal, programItemId: "item-2" }]);
    expect(insight.params.count).toBe(2);
  });

  it("ignores other signal kinds", () => {
    const missed: Signal = { kind: "missed_reps", programItemId: "i", count: 2, lastAt: "x", detail: { missed: 3, total: 4 } };
    const note: Signal = { kind: "repeated_note", count: 1, lastAt: "x", detail: { notes: ["knee"] } };
    expect(run({}, [], [missed, note])).toEqual([]);
  });
});

describe("buildInsights — good_week", () => {
  it("fires at adherence >= 85 when nothing else triggers", () => {
    const [insight] = run({ adherence: 85 });
    expect(insight).toMatchObject({ key: "good_week", severity: "good", replyChip: "goodWeek" });
    expect(insight.params).toMatchObject({ adherence: 85 });
  });

  it("does not fire at 84", () => {
    expect(run({ adherence: 84 })).toEqual([]);
  });

  it("is suppressed by any other triggered rule", () => {
    expect(keys(run({ adherence: 90 }, [], [painSignal]))).toEqual(["pain"]);
    expect(keys(run({ adherence: 90 }, [reading(daysBefore(12))]))).toEqual(["missed_checkins"]);
    expect(keys(run({ adherence: 90, weight: 80 }, [reading(daysBefore(14), { weight: 80 }), FILLER]))).toEqual(["weight_stalled"]);
    expect(keys(run({ adherence: 90, sleep_hours: 5 }, [reading(daysBefore(7), { sleep_hours: 7 }), reading(daysBefore(14), { sleep_hours: 7 })]))).toEqual(["sleep_drop"]);
  });

  it("is skipped when adherence is missing", () => {
    expect(run({ adherence: null })).toEqual([]);
  });
});

describe("buildInsights — missing data and bounds", () => {
  it("returns [] when everything is null and history is empty", () => {
    expect(run({})).toEqual([]);
  });

  it("never invents a value: nulls everywhere across history", () => {
    const history = [reading(daysBefore(7)), reading(daysBefore(14)), reading(daysBefore(21))];
    expect(run({}, history)).toEqual([]);
  });

  it("ignores history rows dated on/after the current check-in", () => {
    const history = [reading(CURRENT_DATE, { weight: 80 }), reading("2026-08-05", { weight: 80 })];
    expect(run({ weight: 80 }, history)).toEqual([]);
  });

  it("drops history rows later than `now` even when they precede the current date", () => {
    const early = new Date("2026-07-01T00:00:00Z");
    // 'now' is before every history row, so there is no usable history at all
    const history = [reading(daysBefore(14), { weight: 80 })];
    expect(buildInsights(reading(CURRENT_DATE, { weight: 80 }), history, [], early)).toEqual([]);
  });

  it("sorts warn before info before good, keeping rule order within a severity", () => {
    const history = [
      reading(daysBefore(14), { weight: 80, sleep_hours: 7, adherence: 90 }),
      reading(daysBefore(7), { sleep_hours: 7 }),
    ];
    const result = run({ weight: 80, sleep_hours: 5, adherence: 50 }, history, [painSignal]);
    expect(keys(result)).toEqual(["pain", "adherence_low", "sleep_drop"]);
  });

  it("puts info after warn", () => {
    const history = [reading(daysBefore(14), { weight: 80 }), FILLER];
    const result = run({ weight: 80, adherence: 50 }, history);
    expect(keys(result)).toEqual(["adherence_low", "weight_stalled"]);
  });

  it("caps at 3 insights, keeping the most severe", () => {
    const history = [
      reading(daysBefore(21), { weight: 80, sleep_hours: 7, adherence: 90 }),
      reading(daysBefore(14), { weight: 80, sleep_hours: 7, adherence: 90 }),
    ];
    // pain + adherence_low + missed_checkins (gap 14) + sleep_drop + weight_stalled all fire
    const result = run({ weight: 80, sleep_hours: 5, adherence: 50 }, history, [painSignal]);
    expect(result).toHaveLength(3);
    expect(keys(result)).toEqual(["pain", "adherence_low", "missed_checkins"]);
    expect(result.every((i) => i.severity === "warn")).toBe(true);
  });

  it("returns only keys and numbers — no translated text", () => {
    for (const insight of run({ weight: 80, adherence: 50 }, [reading(daysBefore(14), { weight: 80 })])) {
      for (const value of Object.values(insight.params)) expect(typeof value).toBe("number");
    }
  });
});
