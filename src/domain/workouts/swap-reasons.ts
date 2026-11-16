/** Why a client swapped the planned exercise mid-workout
 * (workout_set_logs.swap_reason; text + CHECK, same four values in the DB).
 * Labels live at client.workout.swapReason.<value>. */
export const SWAP_REASONS = ["equipment_unavailable", "gym_crowded", "injury_or_pain", "other"] as const;

export type SwapReason = (typeof SWAP_REASONS)[number];

export function asSwapReason(value: unknown): SwapReason | null {
  return SWAP_REASONS.find((r) => r === value) ?? null;
}
