import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import {
  EXTRA_KEYS,
  MEASUREMENT_TYPES,
  dockOrder,
  fieldLabelKey,
  inputRule,
  isAssisted,
  isExtraField,
  measurementFields,
  normalizeMeasurementType,
  primaryMetric,
  toEnteredDistance,
  toEnteredDuration,
  toEnteredWeight,
  toStoredDistance,
  toStoredDuration,
  toStoredWeight,
  type MeasureField,
} from "./measurement";

describe("measurementFields", () => {
  it("gives every type at least one input", () => {
    for (const type of MEASUREMENT_TYPES) expect(measurementFields(type).length).toBeGreaterThan(0);
  });

  it("covers the full list: strength, bodyweight, assisted, holds, distance, machines, intervals, laps", () => {
    expect(measurementFields("weight_reps")).toEqual(["reps", "weight"]);
    expect(measurementFields("bodyweight_reps")).toContain("reps");
    expect(measurementFields("assisted_bw")).toContain("weight");
    expect(measurementFields("duration")).toEqual(["duration"]);
    expect(measurementFields("distance")).toEqual(["distance"]);
    expect(measurementFields("distance_duration")).toEqual(["distance", "duration"]);
    expect(measurementFields("calories")).toContain("calories");
    expect(measurementFields("weight_duration")).toEqual(["duration", "weight"]);
    expect(measurementFields("weight_distance")).toEqual(["distance", "weight"]);
    expect(measurementFields("reps_duration")).toEqual(["reps", "duration"]);
    expect(measurementFields("intervals")).toEqual(["rounds", "work", "restInterval"]);
    expect(measurementFields("cardio_machine")).toEqual(
      expect.arrayContaining(["level", "incline", "speed", "distance", "duration"])
    );
    expect(measurementFields("steps_laps")).toEqual(["laps", "steps"]);
  });

  it("reads an unknown or missing type as weight × reps", () => {
    expect(normalizeMeasurementType(undefined)).toBe("weight_reps");
    expect(normalizeMeasurementType("nonsense")).toBe("weight_reps");
    expect(measurementFields(null)).toEqual(["reps", "weight"]);
  });

  it("keeps the legacy rule: a weight × reps exercise in a rehab/mobility block is a timed hold", () => {
    expect(measurementFields("weight_reps", "rehab")).toEqual(["duration", "weight"]);
    expect(measurementFields("weight_reps", "mobility")).toEqual(["duration", "weight"]);
    expect(measurementFields("weight_reps", "main")).toEqual(["reps", "weight"]);
    // an explicitly typed exercise ignores the block
    expect(measurementFields("distance", "rehab")).toEqual(["distance"]);
  });

  it("dockOrder puts load first", () => {
    expect(dockOrder(["reps", "weight"])).toEqual(["weight", "reps"]);
    expect(dockOrder(["distance", "duration"])).toEqual(["distance", "duration"]);
  });
});

describe("units", () => {
  it("enters long cardio in minutes and km, holds in seconds and carries in metres", () => {
    expect(toStoredDuration("distance_duration", 28)).toBe(1680);
    expect(toEnteredDuration("distance_duration", 1680)).toBe(28);
    expect(toStoredDuration("duration", 45)).toBe(45);
    expect(toStoredDistance("distance_duration", 5)).toBe(5000);
    expect(toEnteredDistance("distance_duration", 5000)).toBe(5);
    expect(toStoredDistance("weight_distance", 20)).toBe(20);
  });

  it("rehab/mobility holds stay in seconds even for the weight × reps default", () => {
    expect(toStoredDuration("weight_reps", 30, "rehab")).toBe(30);
  });

  it("round-trips fractional minutes and km", () => {
    expect(toStoredDuration("cardio_machine", 22.5)).toBe(1350);
    expect(toEnteredDuration("cardio_machine", 1350)).toBe(22.5);
    expect(toEnteredDistance("distance", toStoredDistance("distance", 3.2))).toBe(3.2);
  });

  it("stores assistance as negative weight and reads it back positive; zero is bodyweight", () => {
    expect(isAssisted("assisted_bw")).toBe(true);
    expect(toStoredWeight("assisted_bw", 20)).toBe(-20);
    expect(toEnteredWeight("assisted_bw", -20)).toBe(20);
    expect(toStoredWeight("assisted_bw", 0)).toBeNull();
    expect(toStoredWeight("weight_reps", 60)).toBe(60);
    expect(toStoredWeight("weight_reps", null)).toBeNull();
  });

  it("assisted progression naturally means less help (-20 + 2.5 = -17.5)", () => {
    expect(-20 + 2.5).toBeGreaterThan(-20);
    expect(toEnteredWeight("assisted_bw", -17.5)).toBe(17.5);
  });
});

describe("primaryMetric", () => {
  it("picks what each kind of exercise is judged on", () => {
    expect(primaryMetric("weight_reps")).toBe("weight");
    expect(primaryMetric("bodyweight_reps")).toBe("reps");
    expect(primaryMetric("duration")).toBe("duration");
    expect(primaryMetric("distance")).toBe("distance");
    expect(primaryMetric("distance_duration")).toBe("pace");
    expect(primaryMetric("calories")).toBe("calories");
    expect(primaryMetric("intervals")).toBe("extra");
    expect(primaryMetric("steps_laps")).toBe("extra");
  });
});

describe("inputRule", () => {
  it("uses whole numbers for counts and decimals for load / distance / speed", () => {
    expect(inputRule("weight_reps", "reps").integer).toBe(true);
    expect(inputRule("weight_reps", "weight").integer).toBe(false);
    expect(inputRule("distance", "distance").step).toBe(0.1); // km
    expect(inputRule("weight_distance", "distance").step).toBe(1); // m
  });
});

// Every type, field label and format string must exist in both locales — a
// missing key renders as the raw key path in production.
describe("i18n coverage", () => {
  const allFields: MeasureField[] = [...new Set(MEASUREMENT_TYPES.flatMap((t) => measurementFields(t)))];
  const extras = allFields.filter(isExtraField);

  for (const [name, messages] of [
    ["en", en],
    ["ar", ar],
  ] as const) {
    it(`${name}: has a label for every measurement type`, () => {
      for (const type of MEASUREMENT_TYPES) {
        expect((messages.measure.types as Record<string, string>)[type], type).toBeTruthy();
      }
    });

    it(`${name}: has a label for every field in every unit variant`, () => {
      const labels = messages.measure.fields as Record<string, string>;
      for (const type of MEASUREMENT_TYPES) {
        for (const field of measurementFields(type)) {
          expect(labels[fieldLabelKey(type, field)], `${type}.${field}`).toBeTruthy();
        }
      }
    });

    it(`${name}: has a format string for every extra metric`, () => {
      for (const field of extras) {
        expect((messages.measure.extra as Record<string, string>)[field], field).toBeTruthy();
        expect(EXTRA_KEYS[field]).toBeTruthy();
      }
    });
  }
});
