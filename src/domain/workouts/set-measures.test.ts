import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import {
  EMPTY_MEASURES,
  defaultEnteredSet,
  draftFromMeasures,
  formatSetMeasures,
  measuresFromDraft,
  measuresFromRow,
  sanitizeExtra,
  setToEntered,
  setToStored,
} from "./set-measures";

/** The `measure` namespace with just enough ICU to fill `{value}`. */
function t(key: string, values: Record<string, string | number> = {}): string {
  const raw = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], en.measure) as string;
  return raw.replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
}

const target = { ...EMPTY_MEASURES };

describe("measuresFromDraft", () => {
  it("weight × reps: typed values win, a blank reps falls back to the target, blank weight is bodyweight", () => {
    const prescribed = { ...target, reps: 10, weight: 60 };
    expect(measuresFromDraft("weight_reps", "main", { weight: "62.5", reps: "8" }, prescribed)).toMatchObject({
      weight: 62.5,
      reps: 8,
    });
    expect(measuresFromDraft("weight_reps", "main", { weight: "", reps: "" }, prescribed)).toMatchObject({
      weight: null,
      reps: 10,
    });
  });

  it("0 extra load on a bodyweight target is stored as bodyweight (null)", () => {
    expect(measuresFromDraft("bodyweight_reps", "main", { reps: "12", weight: "0" }, { ...target, reps: 12 }).weight).toBeNull();
  });

  it("assisted: typed assistance becomes negative weight", () => {
    expect(measuresFromDraft("assisted_bw", "main", { reps: "8", weight: "20" }).weight).toBe(-20);
  });

  it("run: km and minutes are stored as metres and seconds", () => {
    const m = measuresFromDraft("distance_duration", "main", { distance: "5", duration: "28" });
    expect(m).toMatchObject({ distance_m: 5000, duration_seconds: 1680, reps: null, weight: null });
  });

  it("accepts Arabic digits and decimal separators", () => {
    expect(measuresFromDraft("distance", "main", { distance: "٢٫٥" }).distance_m).toBe(2500);
  });

  it("treadmill: level / incline / speed go to extra", () => {
    const m = measuresFromDraft("cardio_machine", "main", { duration: "20", level: "3", incline: "2.5", speed: "9" });
    expect(m.extra).toEqual({ level: 3, incline: 2.5, speed: 9 });
    expect(m.duration_seconds).toBe(1200);
  });

  it("intervals: rounds / work / rest map to their extra keys", () => {
    const m = measuresFromDraft("intervals", "main", { rounds: "8", work: "20", restInterval: "10" });
    expect(m.extra).toEqual({ rounds: 8, work_s: 20, rest_s: 10 });
  });

  it("falls back to the prescribed extra metric when left blank", () => {
    const prescribed = { ...target, extra: { incline: 4 } };
    expect(measuresFromDraft("cardio_machine", "main", { duration: "10" }, prescribed).extra).toEqual({ incline: 4 });
  });

  it("ignores fields the type does not have", () => {
    const m = measuresFromDraft("duration", "main", { duration: "45", reps: "10", weight: "20", distance: "3" });
    expect(m).toMatchObject({ duration_seconds: 45, reps: null, weight: null, distance_m: null });
  });

  it("a rehab hold (weight × reps exercise in a rehab block) logs seconds and weight, not reps", () => {
    const m = measuresFromDraft("weight_reps", "rehab", { duration: "30", weight: "2" });
    expect(m).toMatchObject({ duration_seconds: 30, weight: 2, reps: null });
  });
});

describe("draftFromMeasures", () => {
  it("is the inverse of measuresFromDraft, in entered units", () => {
    const stored = measuresFromDraft("distance_duration", "main", { distance: "5", duration: "28" });
    expect(draftFromMeasures("distance_duration", "main", stored)).toEqual({ distance: "5", duration: "28" });
  });

  it("shows assisted weight as a positive figure", () => {
    expect(draftFromMeasures("assisted_bw", "main", { ...target, reps: 8, weight: -20 })).toEqual({ reps: "8", weight: "20" });
  });

  it("only lists the type's own fields", () => {
    expect(Object.keys(draftFromMeasures("duration", "main", { ...target, reps: 5, duration_seconds: 45 }))).toEqual(["duration"]);
  });
});

describe("measuresFromRow / sanitizeExtra", () => {
  it("keeps only flat number/string entries from jsonb", () => {
    expect(sanitizeExtra({ level: 3, side: "left", nested: { a: 1 }, list: [1], bad: null })).toEqual({ level: 3, side: "left" });
    expect(sanitizeExtra(null)).toBeNull();
    expect(sanitizeExtra([1, 2])).toBeNull();
    expect(sanitizeExtra({})).toBeNull();
  });

  it("reads a partial row as nulls", () => {
    expect(measuresFromRow({ reps: 5 })).toEqual({ ...EMPTY_MEASURES, reps: 5 });
    expect(measuresFromRow(undefined)).toEqual(EMPTY_MEASURES);
  });
});

describe("builder conversion", () => {
  it("loads a stored run into entered units and back", () => {
    const row = { distance_m: 5000, duration_seconds: 1800, rest_seconds: 60 };
    const entered = setToEntered("distance_duration", "main", row);
    expect(entered).toMatchObject({ distance_m: 5, duration_seconds: 30, rest_seconds: 60 });
    expect(setToStored("distance_duration", "main", entered)).toMatchObject({ distance_m: 5000, duration_seconds: 1800 });
  });

  it("drops stale values from fields the exercise no longer has", () => {
    const stored = setToStored("duration", "main", { reps: 10, weight: 20, duration_seconds: 45 });
    expect(stored).toMatchObject({ reps: null, weight: null, duration_seconds: 45 });
  });

  it("returns extra as null (not {}) when nothing is set — {} would satisfy the DB's has_measure check", () => {
    expect(setToStored("duration", "main", { duration_seconds: 30, extra: {} }).extra).toBeNull();
  });

  it("starts every type with a set that already satisfies the one-measure rule", () => {
    for (const type of ["weight_reps", "bodyweight_reps", "assisted_bw", "duration", "distance", "distance_duration", "calories", "weight_duration", "weight_distance", "reps_duration", "intervals", "cardio_machine", "steps_laps"]) {
      const stored = setToStored(type, "main", defaultEnteredSet(type, "main"));
      const hasMeasure = stored.reps != null || stored.duration_seconds != null || stored.distance_m != null || stored.calories != null || stored.extra != null;
      expect(hasMeasure, type).toBe(true);
    }
  });
});

describe("formatSetMeasures", () => {
  it("strength", () => {
    expect(formatSetMeasures("weight_reps", "main", { ...target, weight: 60, reps: 10 }, t)).toBe("60 kg × 10");
    expect(formatSetMeasures("weight_reps", "main", { ...target, reps: 12 }, t)).toBe("BW × 12");
    expect(formatSetMeasures("assisted_bw", "main", { ...target, weight: -15, reps: 8 }, t)).toBe("15 kg assist × 8");
  });

  it("holds, distance and calories", () => {
    expect(formatSetMeasures("duration", "main", { ...target, duration_seconds: 45 }, t)).toBe("45 s");
    expect(formatSetMeasures("distance_duration", "main", { ...target, distance_m: 5000, duration_seconds: 1680 }, t)).toBe("5 km · 28 min");
    expect(formatSetMeasures("weight_distance", "main", { ...target, weight: 80, distance_m: 20 }, t)).toBe("80 kg · 20 m");
    expect(formatSetMeasures("calories", "main", { ...target, calories: 150 }, t)).toBe("150 kcal");
  });

  it("extra metrics", () => {
    expect(formatSetMeasures("intervals", "main", { ...target, extra: { rounds: 8, work_s: 20, rest_s: 10 } }, t)).toBe(
      "8 rounds · 20 s work · 10 s rest"
    );
    expect(formatSetMeasures("steps_laps", "main", { ...target, extra: { laps: 12 } }, t)).toBe("12 laps");
  });

  it("an empty set reads as a dash", () => {
    expect(formatSetMeasures("duration", "main", target, t)).toBe("—");
  });
});
