/** The fixed set of day sections the builder renders. A "section" is derived
 * from item data rather than stored as its own row: workout = warmup/main/
 * cooldown, mobility_rehab = mobility/rehab, activities = program_activities.
 * Only their order is persisted (program_days.section_order). */
export const DAY_SECTION_KEYS = ["workout", "mobility_rehab", "activities"] as const;

export type DaySectionKey = (typeof DAY_SECTION_KEYS)[number];

export const DEFAULT_SECTION_ORDER: readonly DaySectionKey[] = DAY_SECTION_KEYS;

export function isDaySectionKey(value: string): value is DaySectionKey {
  return (DAY_SECTION_KEYS as readonly string[]).includes(value);
}

/** Keeps the stored keys in their stored order, drops duplicates/unknown
 * keys, then appends any known section the stored row predates. Appending is
 * the "new sections get the next position" rule: a section that gains
 * content after the day was created lands at the end instead of vanishing. */
export function normalizeSectionOrder(order?: readonly string[] | null): DaySectionKey[] {
  const seen = new Set<DaySectionKey>();
  const normalized: DaySectionKey[] = [];
  for (const key of order ?? []) {
    if (isDaySectionKey(key) && !seen.has(key)) {
      seen.add(key);
      normalized.push(key);
    }
  }
  for (const key of DAY_SECTION_KEYS) {
    if (!seen.has(key)) normalized.push(key);
  }
  return normalized;
}

/** Puts the visible sections into `visibleOrder` while leaving any section
 * that currently has no content in the slot it already occupied. A hidden
 * section is therefore not deleted from the persisted order when another
 * section is dragged or moved past it — it simply renders nothing until it
 * has content again. */
export function reorderVisibleSections(
  currentOrder: readonly string[] | null | undefined,
  visibleOrder: readonly DaySectionKey[]
): DaySectionKey[] {
  const fullOrder = normalizeSectionOrder(currentOrder);
  const visible = new Set(visibleOrder);
  let cursor = 0;
  return fullOrder.map((key) => (visible.has(key) ? visibleOrder[cursor++] : key));
}

/** Up/down fallback for one section within the visible list. Returns null
 * when the section is already at that end, so callers can disable the
 * button instead of persisting a no-op. */
export function moveVisibleSection(
  currentOrder: readonly string[] | null | undefined,
  visibleOrder: readonly DaySectionKey[],
  key: DaySectionKey,
  delta: -1 | 1
): DaySectionKey[] | null {
  const index = visibleOrder.indexOf(key);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= visibleOrder.length) return null;

  const next = [...visibleOrder];
  [next[index], next[target]] = [next[target], next[index]];
  return reorderVisibleSections(currentOrder, next);
}

/** Which reorderable section a program item belongs to. Anything that isn't
 * mobility/rehab is workout work (warmup/main/cooldown, and any future
 * strength block), matching the builder's own split. */
export function sectionKeyForItem(item: { block: string | null }): Extract<DaySectionKey, "workout" | "mobility_rehab"> {
  return item.block === "mobility" || item.block === "rehab" ? "mobility_rehab" : "workout";
}

/** Stable sort of a day's items by the persisted section order. Items inside
 * one section keep their existing (order_index) sequence. Used by the client
 * runner, the plan preview, and print so all three walk the day in the same
 * section order the coach sees in the builder. */
export function sortItemsBySections<T extends { block: string | null }>(
  items: readonly T[],
  order?: readonly string[] | null
): T[] {
  const rank = new Map(normalizeSectionOrder(order).map((key, index) => [key, index]));
  return [...items].sort((a, b) => {
    const aRank = rank.get(sectionKeyForItem(a)) ?? 0;
    const bRank = rank.get(sectionKeyForItem(b)) ?? 0;
    return aRank - bRank;
  });
}
