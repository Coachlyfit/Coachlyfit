/** One set's measurements, in the shape stored on program_item_sets (the
 * prescription) and workout_set_logs (what was done), plus the conversions
 * between that stored shape, the strings a client types into the runner, and
 * the text shown back to them. Pure — the field map and units come from
 * library/measurement.ts. */

import {
  EXTRA_KEYS,
  distanceUnit,
  durationUnit,
  isAssisted,
  isExtraField,
  measurementFields,
  toEnteredDistance,
  toEnteredDuration,
  toEnteredWeight,
  toStoredDistance,
  toStoredDuration,
  toStoredWeight,
  type MeasureField,
} from "@/domain/library/measurement";
import { parseDecimal, trimNumber } from "./session-runner";

export type ExtraValues = Record<string, number | string>;

export type SetMeasures = {
  weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  calories: number | null;
  extra: ExtraValues | null;
};

export const EMPTY_MEASURES: SetMeasures = {
  weight: null,
  reps: null,
  duration_seconds: null,
  distance_m: null,
  calories: null,
  extra: null,
};

/** Strings in the *entered* unit (minutes, km, assistance as a positive
 * figure) — what the dock's text inputs hold. */
export type MeasureDraft = Partial<Record<MeasureField, string>>;

/** jsonb comes back as `Json`; keep only the flat number/string entries this
 * app writes, so a malformed row can never reach a numeric input as an object. */
export function sanitizeExtra(value: unknown): ExtraValues | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: ExtraValues = {};
  for (const [k, v] of Object.entries(value)) {
    if ((typeof v === "number" && Number.isFinite(v)) || typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

type MeasureRow = {
  weight?: number | null;
  reps?: number | null;
  duration_seconds?: number | null;
  distance_m?: number | null;
  calories?: number | null;
  extra?: unknown;
};

export function measuresFromRow(row: MeasureRow | null | undefined): SetMeasures {
  return {
    weight: row?.weight ?? null,
    reps: row?.reps ?? null,
    duration_seconds: row?.duration_seconds ?? null,
    distance_m: row?.distance_m ?? null,
    calories: row?.calories ?? null,
    extra: sanitizeExtra(row?.extra),
  };
}

function extraNumber(extra: ExtraValues | null, field: MeasureField): number | null {
  if (!isExtraField(field)) return null;
  const v = extra?.[EXTRA_KEYS[field]];
  return typeof v === "number" ? v : null;
}

export function draftFromMeasures(type: unknown, block: string | null | undefined, m: SetMeasures): MeasureDraft {
  const draft: MeasureDraft = {};
  for (const field of measurementFields(type, block)) {
    let value: number | null;
    switch (field) {
      case "weight":
        value = toEnteredWeight(type, m.weight);
        break;
      case "reps":
        value = m.reps;
        break;
      case "duration":
        value = toEnteredDuration(type, m.duration_seconds, block);
        break;
      case "distance":
        value = toEnteredDistance(type, m.distance_m);
        break;
      case "calories":
        value = m.calories;
        break;
      default:
        value = extraNumber(m.extra, field);
    }
    draft[field] = value != null ? trimNumber(value) : "";
  }
  return draft;
}

/** Parses the dock's strings back into stored units. A blank field falls back
 * to `fallback` (the target) so "log as prescribed" is one tap — except
 * weight, where blank means bodyweight (null), never "the prescribed load".
 * Fields the type doesn't have are always null. */
export function measuresFromDraft(
  type: unknown,
  block: string | null | undefined,
  draft: MeasureDraft,
  fallback: SetMeasures = EMPTY_MEASURES
): SetMeasures {
  const fields = new Set(measurementFields(type, block));
  const num = (f: MeasureField) => (fields.has(f) ? parseDecimal(draft[f] ?? "") : null);
  const int = (n: number | null) => (n == null ? null : Math.round(n));

  const weightIn = num("weight");
  // A bodyweight exercise with 0 extra load is stored as bodyweight (null).
  const weight = weightIn == null || (weightIn === 0 && fallback.weight == null) ? null : toStoredWeight(type, weightIn);

  const durationIn = num("duration");
  const distanceIn = num("distance");
  const repsIn = num("reps");
  const caloriesIn = num("calories");

  const extra: ExtraValues = {};
  for (const field of fields) {
    if (!isExtraField(field)) continue;
    const key = EXTRA_KEYS[field];
    const entered = num(field);
    const value = entered ?? extraNumber(fallback.extra, field);
    if (value != null) extra[key] = value;
  }

  return {
    weight,
    reps: fields.has("reps") ? (repsIn != null ? Math.round(repsIn) : fallback.reps) : null,
    duration_seconds: fields.has("duration")
      ? durationIn != null
        ? toStoredDuration(type, durationIn, block)
        : fallback.duration_seconds
      : null,
    distance_m: fields.has("distance")
      ? distanceIn != null
        ? toStoredDistance(type, distanceIn)
        : fallback.distance_m
      : null,
    calories: fields.has("calories") ? (caloriesIn != null ? int(caloriesIn) : fallback.calories) : null,
    extra: Object.keys(extra).length > 0 ? extra : null,
  };
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** "60 kg × 10", "5 km · 28 min", "Bodyweight × 12", "−15 kg assist × 8".
 * `t` is the `measure` message namespace (works for both the client and
 * server next-intl translators). */
export function formatSetMeasures(type: unknown, block: string | null | undefined, m: SetMeasures, t: Translate): string {
  const fields = measurementFields(type, block);
  const parts: string[] = [];

  const entered = toEnteredWeight(type, m.weight);
  const weightText =
    entered != null && entered > 0
      ? t(isAssisted(type) ? "assist" : "kg", { value: trimNumber(entered) })
      : null;

  if (fields.includes("reps") && m.reps != null) {
    parts.push(
      fields.includes("weight")
        ? `${weightText ?? t("bodyweight")} × ${m.reps}`
        : t("repsCount", { value: m.reps })
    );
  } else if (weightText) {
    parts.push(weightText);
  }

  // Distance before time: "5 km · 28 min" reads as a run, not "28 min · 5 km".
  if (fields.includes("distance") && m.distance_m != null) {
    parts.push(
      m.distance_m >= 1000
        ? t("km", { value: trimNumber(m.distance_m / 1000) })
        : t("meters", { value: trimNumber(m.distance_m) })
    );
  }
  if (fields.includes("duration") && m.duration_seconds != null) {
    parts.push(
      m.duration_seconds >= 120
        ? t("minutes", { value: trimNumber(m.duration_seconds / 60) })
        : t("seconds", { value: m.duration_seconds })
    );
  }
  if (fields.includes("calories") && m.calories != null) parts.push(t("kcal", { value: m.calories }));

  for (const field of fields) {
    if (!isExtraField(field)) continue;
    const value = extraNumber(m.extra, field);
    if (value != null) parts.push(t(`extra.${field}`, { value: trimNumber(value) }));
  }

  return parts.length > 0 ? parts.join(" · ") : "—";
}

// ---------------------------------------------------------------------------
// Program builder. The builder's form holds values in the *entered* unit
// (minutes, km, positive assistance) under the stored column names, and
// converts at the two edges: setToEntered when a saved set is loaded into the
// form, setToStored when the form is submitted.
// ---------------------------------------------------------------------------

export type SetPayload = {
  reps?: number | null;
  weight?: number | null;
  duration_seconds?: number | null;
  distance_m?: number | null;
  calories?: number | null;
  rest_seconds?: number | null;
  extra?: Record<string, number> | null;
};

function numericExtra(extra: ExtraValues | null): Record<string, number> | null {
  if (!extra) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(extra)) if (typeof v === "number") out[k] = v;
  return Object.keys(out).length > 0 ? out : null;
}

export function setToEntered(
  type: unknown,
  block: string | null | undefined,
  row: MeasureRow & { rest_seconds?: number | null }
): SetPayload {
  const m = measuresFromRow(row);
  return {
    reps: m.reps ?? undefined,
    weight: toEnteredWeight(type, m.weight) ?? undefined,
    duration_seconds: toEnteredDuration(type, m.duration_seconds, block) ?? undefined,
    distance_m: toEnteredDistance(type, m.distance_m) ?? undefined,
    calories: m.calories ?? undefined,
    rest_seconds: row.rest_seconds ?? undefined,
    extra: numericExtra(m.extra) ?? undefined,
  };
}

/** Keeps only the fields the exercise type has (a stale value from a
 * previously selected type must not leak into the saved set) and converts to
 * stored units. */
export function setToStored(type: unknown, block: string | null | undefined, set: SetPayload): SetPayload {
  const fields = new Set(measurementFields(type, block));
  const extra: Record<string, number> = {};
  for (const field of fields) {
    if (!isExtraField(field)) continue;
    const v = set.extra?.[EXTRA_KEYS[field]];
    if (typeof v === "number") extra[EXTRA_KEYS[field]] = v;
  }
  return {
    reps: fields.has("reps") ? (set.reps ?? null) : null,
    weight: fields.has("weight") ? toStoredWeight(type, set.weight ?? null) : null,
    duration_seconds: fields.has("duration") ? toStoredDuration(type, set.duration_seconds ?? null, block) : null,
    distance_m: fields.has("distance") ? toStoredDistance(type, set.distance_m ?? null) : null,
    calories: fields.has("calories") ? (set.calories ?? null) : null,
    rest_seconds: set.rest_seconds ?? null,
    extra: Object.keys(extra).length > 0 ? extra : null,
  };
}

/** A sensible first set (in entered units) for a fresh exercise of this type. */
export function defaultEnteredSet(type: unknown, block?: string | null): SetPayload {
  const km = distanceUnit(type) === "km";
  const fields = measurementFields(type, block);
  const set: SetPayload = {};
  for (const field of fields) {
    switch (field) {
      case "reps":
        set.reps = isAssisted(type) ? 8 : 10;
        break;
      case "duration":
        set.duration_seconds = durationUnit(type, block) === "min" ? 20 : 30;
        break;
      case "distance":
        set.distance_m = km ? 5 : 20;
        break;
      case "calories":
        set.calories = 100;
        break;
      case "rounds":
        set.extra = { ...set.extra, rounds: 8 };
        break;
      case "work":
        set.extra = { ...set.extra, work_s: 20 };
        break;
      case "restInterval":
        set.extra = { ...set.extra, rest_s: 10 };
        break;
      case "laps":
        set.extra = { ...set.extra, laps: 10 };
        break;
      case "steps":
        set.extra = { ...set.extra, steps: 5000 };
        break;
      // weight, level, incline, speed: optional, start blank
    }
  }
  return set;
}
