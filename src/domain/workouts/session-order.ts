/** Expands a day's program_items into the linear sequence a training
 * session actually presents sets in. Ungrouped items are unaffected —
 * each item's own sets in order, items in their existing order_index
 * order. A group (shared group_key, superset or circuit) instead
 * round-robins: set 1 of every member, then set 2 of every member, and so
 * on, so the athlete alternates between exercises within a round rather
 * than finishing one exercise's sets before starting the next. Rest (in
 * the session UI) is meant to apply after a full round, not after every
 * single set within a group — that's a UI concern read off group
 * boundaries, not encoded in this sequence itself. */

export type SessionOrderItem = {
  id: string;
  order_index: number;
  group_key: string | null;
  /** Only the count matters here — set_index in the output is always
   * 0-based and sequential per item, matching how set logs are already
   * keyed (setKey in workout-session-client.tsx). */
  setCount: number;
};

export type SessionStep = { itemId: string; setIndex: number; groupKey: string | null };

/** Groups are only ever expanded round-robin when EVERY member is
 * contiguous in order_index — reorderItems already enforces that
 * server-side (see programs.service.ts), so this never has to fall back to
 * treating a split group as ungrouped; it's a documented precondition, not
 * a runtime check this module re-verifies. */
export function expandSessionOrder(items: SessionOrderItem[]): SessionStep[] {
  const sorted = [...items].sort((a, b) => a.order_index - b.order_index);
  const steps: SessionStep[] = [];

  let i = 0;
  while (i < sorted.length) {
    const item = sorted[i];
    if (item.group_key == null) {
      for (let s = 0; s < item.setCount; s++) steps.push({ itemId: item.id, setIndex: s, groupKey: null });
      i++;
      continue;
    }

    // Collect every contiguous member sharing this group_key.
    const group: SessionOrderItem[] = [];
    while (i < sorted.length && sorted[i].group_key === item.group_key) {
      group.push(sorted[i]);
      i++;
    }

    const maxSets = Math.max(...group.map((m) => m.setCount));
    for (let round = 0; round < maxSets; round++) {
      for (const member of group) {
        if (round < member.setCount) steps.push({ itemId: member.id, setIndex: round, groupKey: member.group_key });
      }
    }
  }

  return steps;
}

/** True once every set in the group's current round has a logged entry —
 * the session UI's cue to start the group's shared rest period rather than
 * resting after each individual set the way an ungrouped item does. */
export function isGroupRoundComplete(
  group: SessionOrderItem[],
  round: number,
  isLogged: (itemId: string, setIndex: number) => boolean
): boolean {
  return group.every((member) => round >= member.setCount || isLogged(member.id, round));
}
