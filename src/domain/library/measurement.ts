/** How an exercise is measured. One text column (exercises.measurement_type,
 * CHECK-constrained in 20261113000001) decides which inputs the program
 * builder, the client runner and the progress views show for it — this file
 * is the only place that mapping lives. */

export const MEASUREMENT_TYPES = [
  "weight_reps",
  "bodyweight_reps",
  "assisted_bw",
  "duration",
  "distance",
  "distance_duration",
  "calories",
  "weight_duration",
  "weight_distance",
  "reps_duration",
  "intervals",
  "cardio_machine",
  "steps_laps",
] as const;

export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];

export const DEFAULT_MEASUREMENT_TYPE: MeasurementType = "weight_reps";

export function isMeasurementType(value: unknown): value is MeasurementType {
  return typeof value === "string" && (MEASUREMENT_TYPES as readonly string[]).includes(value);
}

/** The column has a CHECK, but a row can come from an older cached payload or a
 * query that didn't select it — anything unknown reads as the classic
 * weight × reps. */
export function normalizeMeasurementType(value: unknown): MeasurementType {
  return isMeasurementType(value) ? value : DEFAULT_MEASUREMENT_TYPE;
}

/** Every input a set can carry. The first five map to real columns on
 * program_item_sets / workout_set_logs; the rest live in the `extra` jsonb
 * (see EXTRA_KEYS) so a new machine metric never needs a migration. */
export type MeasureField =
  | "weight"
  | "reps"
  | "duration"
  | "distance"
  | "calories"
  | "rounds"
  | "work"
  | "restInterval"
  | "level"
  | "incline"
  | "speed"
  | "laps"
  | "steps";

/** Builder column order (reps before weight, as the builder has always
 * shown them); the client dock re-orders via dockOrder. */
const FIELDS: Record<MeasurementType, MeasureField[]> = {
  weight_reps: ["reps", "weight"],
  bodyweight_reps: ["reps", "weight"],
  assisted_bw: ["reps", "weight"],
  duration: ["duration"],
  distance: ["distance"],
  distance_duration: ["distance", "duration"],
  calories: ["calories", "duration"],
  weight_duration: ["duration", "weight"],
  weight_distance: ["distance", "weight"],
  reps_duration: ["reps", "duration"],
  intervals: ["rounds", "work", "restInterval"],
  cardio_machine: ["duration", "distance", "calories", "level", "incline", "speed"],
  steps_laps: ["laps", "steps"],
};

/** Where each non-column field is stored inside `extra`. */
export const EXTRA_KEYS = {
  rounds: "rounds",
  work: "work_s",
  restInterval: "rest_s",
  level: "level",
  incline: "incline",
  speed: "speed",
  laps: "laps",
  steps: "steps",
} as const;

export type ExtraField = keyof typeof EXTRA_KEYS;

export function isExtraField(field: MeasureField): field is ExtraField {
  return field in EXTRA_KEYS;
}

/** The inputs to show for an exercise. A plain weight × reps exercise placed
 * in a rehab/mobility block is a timed hold — the behavior those blocks had
 * before exercises carried a type — so existing programs keep working. */
export function measurementFields(type: unknown, block?: string | null): MeasureField[] {
  const t = normalizeMeasurementType(type);
  if (t === "weight_reps" && (block === "rehab" || block === "mobility")) return ["duration", "weight"];
  return FIELDS[t];
}

/** Dock/sheet order: load first, then the count (reps/time/distance). */
export function dockOrder(fields: MeasureField[]): MeasureField[] {
  return fields.includes("weight") ? ["weight", ...fields.filter((f) => f !== "weight")] : fields;
}

/** True when the type has no direct count field of its own and is described
 * only by `extra` metrics (intervals, steps/laps). */
export function isExtraOnly(fields: MeasureField[]): boolean {
  return fields.every(isExtraField);
}

// ---------------------------------------------------------------------------
// Units. Storage is always canonical (kg, seconds, metres); a type may be
// *entered* in a friendlier unit (a 45-minute run is "45", not "2700").
// ---------------------------------------------------------------------------

export type DurationUnit = "s" | "min";
export type DistanceUnit = "m" | "km";

const MINUTE_TYPES: MeasurementType[] = ["distance_duration", "cardio_machine", "calories", "reps_duration"];
const KM_TYPES: MeasurementType[] = ["distance", "distance_duration", "cardio_machine"];

export function durationUnit(type: unknown, block?: string | null): DurationUnit {
  const t = normalizeMeasurementType(type);
  if (t === "weight_reps" && (block === "rehab" || block === "mobility")) return "s";
  return MINUTE_TYPES.includes(t) ? "min" : "s";
}

export function distanceUnit(type: unknown): DistanceUnit {
  return KM_TYPES.includes(normalizeMeasurementType(type)) ? "km" : "m";
}

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

export function toStoredDuration(type: unknown, entered: number | null, block?: string | null): number | null {
  if (entered == null) return null;
  return Math.round(durationUnit(type, block) === "min" ? entered * 60 : entered);
}

export function toEnteredDuration(type: unknown, stored: number | null, block?: string | null): number | null {
  if (stored == null) return null;
  return durationUnit(type, block) === "min" ? round(stored / 60, 2) : stored;
}

export function toStoredDistance(type: unknown, entered: number | null): number | null {
  if (entered == null) return null;
  return distanceUnit(type) === "km" ? round(entered * 1000, 1) : entered;
}

export function toEnteredDistance(type: unknown, stored: number | null): number | null {
  if (stored == null) return null;
  return distanceUnit(type) === "km" ? round(stored / 1000, 3) : stored;
}

/** Assisted bodyweight work is entered as a positive "assistance" figure (a
 * phone's decimal keypad has no minus key) and stored negative, so every
 * existing "add weight" rule — progression's +2.5 kg, "heaviest set wins" —
 * naturally means "less help". Zero assistance is just bodyweight (null). */
export function isAssisted(type: unknown): boolean {
  return normalizeMeasurementType(type) === "assisted_bw";
}

export function toStoredWeight(type: unknown, entered: number | null): number | null {
  if (entered == null) return null;
  if (!isAssisted(type)) return entered;
  return entered === 0 ? null : -Math.abs(entered);
}

export function toEnteredWeight(type: unknown, stored: number | null): number | null {
  if (stored == null) return null;
  return isAssisted(type) ? Math.abs(stored) : stored;
}

// ---------------------------------------------------------------------------
// What a progress view should headline for an exercise.
// ---------------------------------------------------------------------------

export type PrimaryMetric = "weight" | "reps" | "duration" | "distance" | "pace" | "calories" | "extra";

export function primaryMetric(type: unknown): PrimaryMetric {
  switch (normalizeMeasurementType(type)) {
    case "weight_reps":
    case "weight_duration":
    case "weight_distance":
      return "weight";
    case "bodyweight_reps":
    case "assisted_bw":
    case "reps_duration":
      return "reps";
    case "duration":
      return "duration";
    case "distance":
      return "distance";
    case "distance_duration":
    case "cardio_machine":
      return "pace";
    case "calories":
      return "calories";
    // Metrics that live in `extra` have no column to aggregate in SQL or chart.
    case "intervals":
    case "steps_laps":
      return "extra";
  }
}

// ---------------------------------------------------------------------------
// Presentation hints shared by the builder grid, the client dock and the set
// sheet, so one field reads and validates the same everywhere.
// ---------------------------------------------------------------------------

/** Message key under `measure.fields` for a field's label (units included:
 * "Time (min)", "Assistance (kg)"). */
export function fieldLabelKey(type: unknown, field: MeasureField, block?: string | null): string {
  switch (field) {
    case "weight":
      return isAssisted(type) ? "assistKg" : "weightKg";
    case "duration":
      return durationUnit(type, block) === "min" ? "durationMin" : "durationS";
    case "distance":
      return distanceUnit(type) === "km" ? "distanceKm" : "distanceM";
    default:
      return field;
  }
}

export type InputRule = { min: number; max: number; step: number; integer: boolean };

/** HTML input constraints for a field *as typed* (i.e. in the entered unit). */
export function inputRule(type: unknown, field: MeasureField, block?: string | null): InputRule {
  switch (field) {
    case "weight":
      return { min: 0, max: 1000, step: 0.5, integer: false };
    case "reps":
      return { min: 1, max: 500, step: 1, integer: true };
    case "duration":
      return durationUnit(type, block) === "min"
        ? { min: 0.5, max: 240, step: 0.5, integer: false }
        : { min: 1, max: 14_400, step: 1, integer: true };
    case "distance":
      return distanceUnit(type) === "km"
        ? { min: 0.1, max: 1000, step: 0.1, integer: false }
        : { min: 1, max: 100_000, step: 1, integer: true };
    case "calories":
      return { min: 1, max: 10_000, step: 5, integer: true };
    case "rounds":
      return { min: 1, max: 100, step: 1, integer: true };
    case "work":
    case "restInterval":
      return { min: 0, max: 3600, step: 5, integer: true };
    case "level":
      return { min: 0, max: 100, step: 1, integer: false };
    case "incline":
      return { min: -10, max: 100, step: 0.5, integer: false };
    case "speed":
      return { min: 0, max: 100, step: 0.1, integer: false };
    case "laps":
      return { min: 1, max: 1000, step: 1, integer: true };
    case "steps":
      return { min: 1, max: 200_000, step: 100, integer: true };
  }
}

/** How much one +/- tap moves a field in the client dock. */
export function dockStep(type: unknown, field: MeasureField, block?: string | null): number {
  switch (field) {
    case "weight":
      return 2.5;
    case "duration":
      return durationUnit(type, block) === "min" ? 1 : 5;
    case "distance":
      return distanceUnit(type) === "km" ? 0.5 : 5;
    case "calories":
      return 10;
    case "work":
    case "restInterval":
      return 5;
    case "steps":
      return 500;
    case "speed":
    case "incline":
      return 0.5;
    default:
      return 1;
  }
}

/** Rounding grid for +/- taps and typed values in the client UI. */
export function fieldSnap(type: unknown, field: MeasureField, block?: string | null): number {
  switch (field) {
    case "weight":
      return 0.25;
    case "distance":
      return distanceUnit(type) === "km" ? 0.1 : 1;
    case "duration":
      return durationUnit(type, block) === "min" ? 0.5 : 1;
    case "speed":
    case "incline":
      return 0.1;
    default:
      return 1;
  }
}
