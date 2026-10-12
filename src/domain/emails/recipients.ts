export const RECIPIENT_FILTERS = ["all", "active", "selected"] as const;
export type RecipientFilter = (typeof RECIPIENT_FILTERS)[number];

/** Narrows the coach list to a campaign's audience. Shared by the compose
 * form (live count, on rows without emails) and the send action (the real
 * list), so the count the admin confirms follows the same rule as the send. */
export function selectRecipients<T extends { coachId: string; status: string | null }>(
  coaches: readonly T[],
  filter: RecipientFilter,
  selectedIds: readonly string[]
): T[] {
  if (filter === "active") return coaches.filter((coach) => coach.status === "active");
  if (filter === "selected") {
    const ids = new Set(selectedIds);
    return coaches.filter((coach) => ids.has(coach.coachId));
  }
  return [...coaches];
}
