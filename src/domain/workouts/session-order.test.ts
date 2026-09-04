import { describe, expect, it } from "vitest";
import { expandSessionOrder, isGroupRoundComplete, type SessionOrderItem } from "./session-order";

describe("expandSessionOrder", () => {
  it("ungrouped items produce their own sets in order, items in order_index order", () => {
    const items: SessionOrderItem[] = [
      { id: "b", order_index: 1, group_key: null, setCount: 2 },
      { id: "a", order_index: 0, group_key: null, setCount: 3 },
    ];
    expect(expandSessionOrder(items)).toEqual([
      { itemId: "a", setIndex: 0, groupKey: null },
      { itemId: "a", setIndex: 1, groupKey: null },
      { itemId: "a", setIndex: 2, groupKey: null },
      { itemId: "b", setIndex: 0, groupKey: null },
      { itemId: "b", setIndex: 1, groupKey: null },
    ]);
  });

  it("a group round-robins: one set per member per round, in order_index order", () => {
    const items: SessionOrderItem[] = [
      { id: "a", order_index: 0, group_key: "g1", setCount: 3 },
      { id: "b", order_index: 1, group_key: "g1", setCount: 3 },
    ];
    expect(expandSessionOrder(items)).toEqual([
      { itemId: "a", setIndex: 0, groupKey: "g1" },
      { itemId: "b", setIndex: 0, groupKey: "g1" },
      { itemId: "a", setIndex: 1, groupKey: "g1" },
      { itemId: "b", setIndex: 1, groupKey: "g1" },
      { itemId: "a", setIndex: 2, groupKey: "g1" },
      { itemId: "b", setIndex: 2, groupKey: "g1" },
    ]);
  });

  it("a group with uneven set counts stops including the exhausted member early, using the max as the round count", () => {
    const items: SessionOrderItem[] = [
      { id: "a", order_index: 0, group_key: "g1", setCount: 2 },
      { id: "b", order_index: 1, group_key: "g1", setCount: 3 },
    ];
    expect(expandSessionOrder(items)).toEqual([
      { itemId: "a", setIndex: 0, groupKey: "g1" },
      { itemId: "b", setIndex: 0, groupKey: "g1" },
      { itemId: "a", setIndex: 1, groupKey: "g1" },
      { itemId: "b", setIndex: 1, groupKey: "g1" },
      { itemId: "b", setIndex: 2, groupKey: "g1" },
    ]);
  });

  it("mixes ungrouped items and a group, each contiguous block handled by its own rule", () => {
    const items: SessionOrderItem[] = [
      { id: "solo1", order_index: 0, group_key: null, setCount: 1 },
      { id: "a", order_index: 1, group_key: "g1", setCount: 2 },
      { id: "b", order_index: 2, group_key: "g1", setCount: 2 },
      { id: "solo2", order_index: 3, group_key: null, setCount: 1 },
    ];
    expect(expandSessionOrder(items)).toEqual([
      { itemId: "solo1", setIndex: 0, groupKey: null },
      { itemId: "a", setIndex: 0, groupKey: "g1" },
      { itemId: "b", setIndex: 0, groupKey: "g1" },
      { itemId: "a", setIndex: 1, groupKey: "g1" },
      { itemId: "b", setIndex: 1, groupKey: "g1" },
      { itemId: "solo2", setIndex: 0, groupKey: null },
    ]);
  });

  it("returns an empty sequence for no items", () => {
    expect(expandSessionOrder([])).toEqual([]);
  });

  it("an item with zero sets contributes nothing", () => {
    const items: SessionOrderItem[] = [{ id: "a", order_index: 0, group_key: null, setCount: 0 }];
    expect(expandSessionOrder(items)).toEqual([]);
  });
});

describe("isGroupRoundComplete", () => {
  const group: SessionOrderItem[] = [
    { id: "a", order_index: 0, group_key: "g1", setCount: 2 },
    { id: "b", order_index: 1, group_key: "g1", setCount: 2 },
  ];

  it("true when every member has a logged set for the round", () => {
    const logged = new Set(["a-0", "b-0"]);
    expect(isGroupRoundComplete(group, 0, (id, i) => logged.has(`${id}-${i}`))).toBe(true);
  });

  it("false when any member is missing a logged set for the round", () => {
    const logged = new Set(["a-0"]);
    expect(isGroupRoundComplete(group, 0, (id, i) => logged.has(`${id}-${i}`))).toBe(false);
  });

  it("a member with fewer sets than the round index doesn't block completion", () => {
    const shortGroup: SessionOrderItem[] = [
      { id: "a", order_index: 0, group_key: "g1", setCount: 1 },
      { id: "b", order_index: 1, group_key: "g1", setCount: 2 },
    ];
    const logged = new Set(["b-1"]);
    expect(isGroupRoundComplete(shortGroup, 1, (id, i) => logged.has(`${id}-${i}`))).toBe(true);
  });
});
