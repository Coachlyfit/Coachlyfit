/** Per-set prescription targets beyond the measures themselves. The set types
 * mirror program_item_sets_set_type_check in
 * 20261114000003_set_targets_and_item_options.sql. */

export const SET_TYPES = ["working", "warmup", "backoff", "drop", "failure", "amrap"] as const;
export type SetType = (typeof SET_TYPES)[number];

export function asSetType(v: string | null | undefined): SetType {
  return (SET_TYPES as readonly string[]).includes(v ?? "") ? (v as SetType) : "working";
}

/** Kilograms for a %1RM prescription, rounded to the nearest 2.5 kg (the
 * smallest jump most gyms can load). Null when there is no 1RM to resolve
 * against — the runner then shows the percentage and leaves weight blank. */
export function loadFromPct(pct: number, oneRepMax: number | null | undefined): number | null {
  if (oneRepMax == null || oneRepMax <= 0 || pct <= 0) return null;
  return Math.max(2.5, Math.round((oneRepMax * pct) / 100 / 2.5) * 2.5);
}
