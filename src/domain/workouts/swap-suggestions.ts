/** Pure logic behind the workout "Swap exercise" sheet: what to offer when a
 * client can't do the planned exercise. Coach-curated alternatives win; with
 * none defined we suggest same-muscle, different-equipment exercises. */

import { asSwapReason, type SwapReason } from "./swap-reasons";

export type SwapCandidate = {
  id: string;
  name_ar: string;
  name_en: string;
  muscle_group: string | null;
  equipment: string | null;
  primary_muscles: string[] | null;
  archived_at?: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function primaryOverlap(a: SwapCandidate, b: SwapCandidate): number {
  const mine = new Set((a.primary_muscles ?? []).map(norm).filter(Boolean));
  return (b.primary_muscles ?? []).map(norm).filter((m) => mine.has(m)).length;
}

/** Same primary muscle group, different equipment, never the current
 * exercise. Best match first: more shared primary muscles ranks higher, ties
 * keep the input order (the library's own ordering).
 *
 * - "Same muscle group" = equal `muscle_group`; when the current exercise has
 *   none, a shared primary muscle is accepted instead.
 * - "Different equipment" drops only candidates whose equipment is known and
 *   equal to the current one; unknown equipment can't be ruled out. */
export function suggestSwaps<T extends SwapCandidate>(current: SwapCandidate, candidates: readonly T[], limit = 8): T[] {
  const group = norm(current.muscle_group);
  const equipment = norm(current.equipment);

  return candidates
    .map((candidate, index) => ({ candidate, index, overlap: primaryOverlap(current, candidate) }))
    .filter(({ candidate, overlap }) => {
      if (candidate.id === current.id || candidate.archived_at) return false;
      const sameMuscle = group ? norm(candidate.muscle_group) === group : overlap > 0;
      if (!sameMuscle) return false;
      const candidateEquipment = norm(candidate.equipment);
      return !(equipment && candidateEquipment && candidateEquipment === equipment);
    })
    .sort((a, b) => b.overlap - a.overlap || a.index - b.index)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

export type RestoredSwap<T> = { exercise: T; reason: SwapReason | null };

/** Rebuilds the runner's "item -> exercise it's being done as" map from the
 * sets already logged, so a refresh or resume doesn't silently revert to the
 * planned exercise. The latest logged set of an item decides: swapping back
 * to the original logs later sets with no substitute. */
export function restoreSwaps<T extends { id: string }>(
  logs: readonly {
    program_item_id: string;
    set_index: number;
    substituted_exercise_id: string | null;
    swap_reason: string | null;
  }[],
  exercises: readonly T[]
): Record<string, RestoredSwap<T>> {
  const latest = new Map<string, (typeof logs)[number]>();
  for (const log of logs) {
    const seen = latest.get(log.program_item_id);
    if (!seen || log.set_index > seen.set_index) latest.set(log.program_item_id, log);
  }
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const out: Record<string, RestoredSwap<T>> = {};
  for (const [itemId, log] of latest) {
    const exercise = log.substituted_exercise_id ? byId.get(log.substituted_exercise_id) : undefined;
    if (exercise) out[itemId] = { exercise, reason: asSwapReason(log.swap_reason) };
  }
  return out;
}

export type SwapOptions<T> ={ source: "coach" | "suggested"; options: T[] };

/** The coach's alternatives (in their order) if any usable ones exist, else
 * the fallback suggestions. */
export function resolveSwapOptions<T extends SwapCandidate>(
  current: SwapCandidate,
  alternatives: readonly T[],
  candidates: readonly T[],
  limit = 8
): SwapOptions<T> {
  const usable = alternatives.filter((a) => a.id !== current.id && !a.archived_at);
  if (usable.length > 0) return { source: "coach", options: [...usable] };
  return { source: "suggested", options: suggestSwaps(current, candidates, limit) };
}
