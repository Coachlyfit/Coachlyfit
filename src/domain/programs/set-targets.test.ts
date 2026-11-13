import { describe, expect, it } from "vitest";
import { asSetType, loadFromPct } from "./set-targets";
import { projectSetsForWeek } from "./progression";
import { formatSetMeasures, measuresFromRow, repsLabel, setToEntered, setToStored, targetTags } from "../workouts/set-measures";

const t = (key: string, v?: Record<string, string | number>) => (v ? `${key}:${Object.values(v).join(",")}` : key);

describe("loadFromPct", () => {
  it("rounds to the nearest 2.5 kg", () => {
    expect(loadFromPct(75, 140)).toBe(105);
    expect(loadFromPct(82.5, 100)).toBe(82.5);
    expect(loadFromPct(70, 101)).toBe(70); // 70.7 -> 70
  });
  it("is null without a usable 1RM or percentage", () => {
    expect(loadFromPct(75, null)).toBeNull();
    expect(loadFromPct(75, 0)).toBeNull();
    expect(loadFromPct(0, 100)).toBeNull();
  });
});

describe("asSetType", () => {
  it("falls back to working", () => {
    expect(asSetType("drop")).toBe("drop");
    expect(asSetType("bogus")).toBe("working");
    expect(asSetType(null)).toBe("working");
  });
});

describe("rep ranges and %1RM in set text", () => {
  it("shows a range, and a percentage when there is no fixed load", () => {
    expect(repsLabel(8, 12)).toBe("8-12");
    expect(repsLabel(8, 8)).toBe("8");
    expect(repsLabel(8, null)).toBe("8");
    const m = measuresFromRow({ reps: 5, reps_max: 8, pct_1rm: 75 });
    expect(formatSetMeasures("weight_reps", "main", m, t)).toBe("pctOneRm:75 × 5-8");
  });
});

describe("targetTags", () => {
  it("tags non-working sets and intensity targets only", () => {
    expect(targetTags({ set_type: "working" }, t)).toEqual([]);
    expect(targetTags({ set_type: "backoff", rpe_target: 8, rir_target: 2 }, t)).toEqual([
      "setTypes.backoff",
      "targets.rpe:8",
      "targets.rir:2",
    ]);
  });
});

describe("builder conversion of targets", () => {
  it("round-trips targets for a rep-based exercise and strips them from a hold", () => {
    const row = { reps: 5, reps_max: 8, pct_1rm: 80, rpe_target: 8, rir_target: null, set_type: "backoff", weight: null };
    const entered = setToEntered("weight_reps", "main", row);
    expect(entered).toMatchObject({ reps_max: 8, pct_1rm: 80, rpe_target: 8, set_type: "backoff" });
    expect(setToStored("weight_reps", "main", entered)).toMatchObject({ reps: 5, reps_max: 8, pct_1rm: 80, set_type: "backoff" });
    const hold = setToStored("duration", "main", { duration_seconds: 30, reps_max: 9, pct_1rm: 50 });
    expect(hold).toMatchObject({ reps_max: null, pct_1rm: null });
  });
});

describe("progression with ranges", () => {
  it("slides the whole rep range under +1 rep/week and passes targets through", () => {
    const base = [{ set_index: 1, reps: 8, reps_max: 12, weight: 60, rest_seconds: 90, duration_seconds: null, pct_1rm: 70, set_type: "working" }];
    const [wk3] = projectSetsForWeek(base, "plus_1_rep_week", 3);
    expect(wk3).toMatchObject({ reps: 10, reps_max: 14, pct_1rm: 70, set_type: "working" });
  });
});
