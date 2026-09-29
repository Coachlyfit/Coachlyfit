import { MUSCLE_GROUPS, isKnownMuscleGroup, type MuscleGroup } from "@/domain/library/taxonomy";
import { accumulateMuscleVolume, normalizeVolumeToIntensity, type MuscleRegionState } from "@/domain/library/muscle-regions";

type VolumeItem = {
  program_item_sets: unknown[];
  exercises: {
    muscle_group: string | null;
    primary_muscles?: string[] | null;
    secondary_muscles?: string[] | null;
  };
};
type VolumeDay = { program_items: VolumeItem[] };

export type MuscleGroupVolume = { muscleGroup: MuscleGroup; sets: number };

/** Sets/week by muscle group, for the Program Builder's volume sidebar.
 * Week-invariant by design: progression (progression.ts) changes weight/reps
 * per set, never set count, and a deload week doesn't drop sets either — so
 * this reads the tree once, not per selected week. Legacy/unknown
 * `muscle_group` values (see taxonomy.ts — the column has no DB constraint)
 * fall into "other" rather than being dropped, so nothing is silently
 * uncounted. Always returns all 10 groups, zero included, so the sidebar can
 * render a stable set of bars without checking for missing keys. */
export function muscleGroupWeeklyVolume(days: VolumeDay[]): MuscleGroupVolume[] {
  const counts = new Map<MuscleGroup, number>(MUSCLE_GROUPS.map((group) => [group, 0]));

  for (const day of days) {
    for (const item of day.program_items) {
      const group = isKnownMuscleGroup(item.exercises.muscle_group) ? item.exercises.muscle_group : "other";
      counts.set(group, (counts.get(group) ?? 0) + item.program_item_sets.length);
    }
  }

  return MUSCLE_GROUPS.map((group) => ({ muscleGroup: group, sets: counts.get(group) ?? 0 }));
}

/** Sets/week by body-muscles region, normalized so the busiest region is 10
 * — feeds the volume sidebar's BodyMap heatmap. Same week-invariant reading
 * as muscleGroupWeeklyVolume, just weighted per-muscle (primary_muscles
 * count a full set, secondary_muscles half — see accumulateMuscleVolume)
 * instead of bucketed by the coarse muscle_group column. */
export function muscleWeeklyVolume(days: VolumeDay[]): MuscleRegionState {
  const entries = days.flatMap((day) =>
    day.program_items.map((item) => ({
      primaryMuscles: item.exercises.primary_muscles,
      secondaryMuscles: item.exercises.secondary_muscles,
      muscleGroup: item.exercises.muscle_group,
      sets: item.program_item_sets.length,
    }))
  );
  return normalizeVolumeToIntensity(accumulateMuscleVolume(entries));
}
