/** Suggests the next set's weight from the client's own last logged
 * performance on the same exercise, rather than always re-showing the
 * coach's static prescription. Progressive-overload rule, applied only
 * when there's real history to work from:
 *   - target reps missed last time -> keep the same weight (no deload)
 *   - RPE <= 7 (it felt easy) -> +2.5kg
 *   - RPE 8-10, or no RPE recorded -> keep the same weight (don't guess)
 * Bodyweight sets (lastWeight null) are returned unchanged -- there's
 * nothing to add a delta to. */
export function suggestNextWeight(input: {
  lastWeight: number | null;
  lastReps: number | null;
  lastRpe: number | null;
  targetReps: number;
}): number | null {
  const { lastWeight, lastReps, lastRpe, targetReps } = input;
  if (lastWeight == null || lastWeight <= 0) return lastWeight;

  const round = (w: number) => Math.round(w * 4) / 4; // nearest 0.25kg

  if (targetReps > 0 && lastReps != null && lastReps < targetReps) return lastWeight;

  if (lastRpe != null && lastRpe <= 7) return round(lastWeight + 2.5);

  return lastWeight;
}
