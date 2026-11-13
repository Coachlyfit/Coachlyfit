import { describe, expect, it } from "vitest";
import { buildSchedule, formatClock, scheduleTotalS, snapshotAt, splitsFromMarks, stopwatchSnapshot } from "./interval-timer";

describe("buildSchedule", () => {
  it("amrap is one work phase of the time cap; null without a cap", () => {
    expect(buildSchedule("amrap", { time_cap_s: 600 })).toEqual([{ kind: "work", round: 1, durationS: 600 }]);
    expect(buildSchedule("amrap", {})).toBeNull();
  });

  it("emom is one work phase per round", () => {
    const s = buildSchedule("emom", { interval_s: 60, rounds: 3 })!;
    expect(s.map((p) => [p.kind, p.round, p.durationS])).toEqual([
      ["work", 1, 60],
      ["work", 2, 60],
      ["work", 3, 60],
    ]);
  });

  it("tabata alternates work/rest with no trailing rest", () => {
    const s = buildSchedule("tabata", { work_s: 20, rest_s: 10, rounds: 2 })!;
    expect(s.map((p) => [p.kind, p.durationS])).toEqual([
      ["work", 20],
      ["rest", 10],
      ["work", 20],
    ]);
    expect(scheduleTotalS(s)).toBe(50);
  });

  it("for_time has no schedule (stopwatch)", () => {
    expect(buildSchedule("for_time", { rounds: 3 })).toBeNull();
  });
});

describe("snapshotAt", () => {
  const tabata = buildSchedule("tabata", { work_s: 20, rest_s: 10, rounds: 2 })!;

  it("finds the phase and ceil'd remaining seconds", () => {
    const at = snapshotAt(tabata, 21_500); // 1.5s into the rest phase
    expect(at.phaseIndex).toBe(1);
    expect(at.phase?.kind).toBe("rest");
    expect(at.remainingS).toBe(9);
    expect(at.done).toBe(false);
  });

  it("flips phase exactly on the boundary", () => {
    expect(snapshotAt(tabata, 20_000).phase?.kind).toBe("rest");
    expect(snapshotAt(tabata, 19_999).phase?.kind).toBe("work");
  });

  it("is done at and after the total, and clamps negative elapsed", () => {
    expect(snapshotAt(tabata, 50_000).done).toBe(true);
    expect(snapshotAt(tabata, 999_000).elapsedS).toBe(50);
    expect(snapshotAt(tabata, -5).phaseIndex).toBe(0);
  });
});

describe("stopwatch + helpers", () => {
  it("flags the cap", () => {
    expect(stopwatchSnapshot(899_000, 900)).toEqual({ elapsedS: 899, capped: false });
    expect(stopwatchSnapshot(900_000, 900).capped).toBe(true);
    expect(stopwatchSnapshot(5_000).capped).toBe(false);
  });

  it("turns cumulative marks into splits", () => {
    expect(splitsFromMarks([30, 75, 130])).toEqual([30, 45, 55]);
    expect(splitsFromMarks([])).toEqual([]);
  });

  it("formats clocks", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-3)).toBe("0:00");
  });
});
