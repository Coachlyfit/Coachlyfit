import { measurementFields, normalizeMeasurementType, type MeasurementType } from "@/domain/library/measurement";
import type { MeasureRecord, PersonalRecord } from "./prs";

/** One exercise's personal bests, ready for PrList. Which fields are set
 * depends on how the exercise is measured, so a plank shows its longest hold
 * and a run shows its best pace rather than an empty weight line. */
export type PrRow = {
  exerciseId: string;
  exerciseName: { name_ar: string; name_en: string };
  measurementType: MeasurementType;
  maxWeight: { weight: number; reps: number } | null;
  estimatedOneRepMax: number | null;
  maxReps: number | null;
  maxDuration: number | null;
  maxDistance: number | null;
  /** Seconds per km. */
  bestPace: number | null;
  maxCalories: number | null;
};

type ExerciseRef = { id: string; name_ar: string; name_en: string; measurement_type?: string | null };

/** Joins strength records and non-weight records onto exercise names and keeps
 * only the metrics that make sense for each exercise's measurement type. Rows
 * with nothing left to show are dropped. Shared by the client's own progress
 * page and the coach's client profile. */
export function buildPrRows(
  strength: PersonalRecord[],
  measures: MeasureRecord[],
  exercises: ExerciseRef[]
): PrRow[] {
  const strengthBy = new Map(strength.map((r) => [r.exerciseId, r]));
  const measureBy = new Map(measures.map((r) => [r.exerciseId, r]));

  const rows: PrRow[] = [];
  for (const ex of exercises) {
    const type = normalizeMeasurementType(ex.measurement_type);
    const fields = measurementFields(type);
    const s = strengthBy.get(ex.id);
    const m = measureBy.get(ex.id);
    const row: PrRow = {
      exerciseId: ex.id,
      exerciseName: { name_ar: ex.name_ar, name_en: ex.name_en },
      measurementType: type,
      maxWeight: s?.maxWeight ? { weight: s.maxWeight.weight, reps: s.maxWeight.reps } : null,
      estimatedOneRepMax: s?.estimatedOneRepMax?.value ?? null,
      // Reps only headline an exercise that has no weight record to show.
      maxReps: fields.includes("reps") && !s?.maxWeight ? (m?.maxReps ?? null) : null,
      maxDuration: fields.includes("duration") ? (m?.maxDuration ?? null) : null,
      maxDistance: fields.includes("distance") ? (m?.maxDistance ?? null) : null,
      bestPace: fields.includes("distance") && fields.includes("duration") ? (m?.bestPace ?? null) : null,
      maxCalories: fields.includes("calories") ? (m?.maxCalories ?? null) : null,
    };
    if (
      row.maxWeight ||
      row.maxReps != null ||
      row.maxDuration != null ||
      row.maxDistance != null ||
      row.bestPace != null ||
      row.maxCalories != null
    ) {
      rows.push(row);
    }
  }
  return rows;
}
