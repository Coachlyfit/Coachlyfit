import { describe, expect, it } from "vitest";
import { resolveSwapOptions, restoreSwaps, suggestSwaps, type SwapCandidate } from "./swap-suggestions";

function ex(id: string, over: Partial<SwapCandidate> = {}): SwapCandidate {
  return {
    id,
    name_ar: id,
    name_en: id,
    muscle_group: "chest",
    equipment: "barbell",
    primary_muscles: ["pectoralis major"],
    archived_at: null,
    ...over,
  };
}

const ids = (list: SwapCandidate[]) => list.map((e) => e.id);

describe("suggestSwaps", () => {
  const current = ex("bench", { equipment: "barbell" });

  it("keeps same muscle group with different equipment", () => {
    const out = suggestSwaps(current, [
      ex("db-press", { equipment: "dumbbell" }),
      ex("machine-press", { equipment: "machine" }),
    ]);
    expect(ids(out)).toEqual(["db-press", "machine-press"]);
  });

  it("excludes the current exercise itself", () => {
    expect(ids(suggestSwaps(current, [ex("bench", { equipment: "dumbbell" }), ex("fly", { equipment: "cable" })]))).toEqual([
      "fly",
    ]);
  });

  it("excludes the same equipment, ignoring case and whitespace", () => {
    const out = suggestSwaps(current, [ex("incline", { equipment: " Barbell " }), ex("db", { equipment: "dumbbell" })]);
    expect(ids(out)).toEqual(["db"]);
  });

  it("excludes other muscle groups", () => {
    expect(ids(suggestSwaps(current, [ex("squat", { muscle_group: "legs", equipment: "barbell" })]))).toEqual([]);
  });

  it("excludes archived exercises", () => {
    expect(ids(suggestSwaps(current, [ex("old", { equipment: "cable", archived_at: "2026-01-01" })]))).toEqual([]);
  });

  it("keeps candidates with unknown equipment (can't be ruled out)", () => {
    expect(ids(suggestSwaps(current, [ex("mystery", { equipment: null })]))).toEqual(["mystery"]);
  });

  it("ranks more shared primary muscles first, ties keep input order", () => {
    const rich = ex("bench", { primary_muscles: ["pectoralis major", "anterior deltoid"] });
    const out = suggestSwaps(rich, [
      ex("a", { equipment: "cable", primary_muscles: ["triceps"] }),
      ex("b", { equipment: "dumbbell", primary_muscles: ["pectoralis major", "anterior deltoid"] }),
      ex("c", { equipment: "machine", primary_muscles: ["pectoralis major"] }),
      ex("d", { equipment: "band", primary_muscles: ["pectoralis major"] }),
    ]);
    expect(ids(out)).toEqual(["b", "c", "d", "a"]);
  });

  it("falls back to a shared primary muscle when the current exercise has no group", () => {
    const noGroup = ex("x", { muscle_group: null });
    const out = suggestSwaps(noGroup, [
      ex("shares", { muscle_group: "chest", equipment: "dumbbell" }),
      ex("other", { muscle_group: "legs", equipment: "dumbbell", primary_muscles: ["quadriceps"] }),
    ]);
    expect(ids(out)).toEqual(["shares"]);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 12 }, (_, i) => ex(`e${i}`, { equipment: `eq${i}` }));
    expect(suggestSwaps(current, many, 5)).toHaveLength(5);
  });
});

describe("resolveSwapOptions", () => {
  const current = ex("bench", { equipment: "barbell" });
  const candidates = [ex("db", { equipment: "dumbbell" })];

  it("prefers the coach's alternatives, in their order, even with the same equipment", () => {
    const alternatives = [ex("z", { muscle_group: "legs", equipment: "barbell" }), ex("a", { equipment: "barbell" })];
    const out = resolveSwapOptions(current, alternatives, candidates);
    expect(out.source).toBe("coach");
    expect(ids(out.options)).toEqual(["z", "a"]);
  });

  it("falls back to suggestions when there are no alternatives", () => {
    const out = resolveSwapOptions(current, [], candidates);
    expect(out.source).toBe("suggested");
    expect(ids(out.options)).toEqual(["db"]);
  });

  it("falls back when every alternative is the current exercise or archived", () => {
    const out = resolveSwapOptions(current, [ex("bench"), ex("old", { archived_at: "2026-01-01" })], candidates);
    expect(out.source).toBe("suggested");
  });
});

describe("restoreSwaps", () => {
  const exercises = [ex("db"), ex("cable")];
  const log = (program_item_id: string, set_index: number, substituted_exercise_id: string | null, swap_reason: string | null = null) => ({
    program_item_id,
    set_index,
    substituted_exercise_id,
    swap_reason,
  });

  it("maps each item to the exercise it was last logged as, with its reason", () => {
    const out = restoreSwaps([log("item-1", 1, "db", "gym_crowded"), log("item-1", 2, "db", "gym_crowded")], exercises);
    expect(out).toEqual({ "item-1": { exercise: exercises[0], reason: "gym_crowded" } });
  });

  it("the latest set decides: swapping back to the original clears the swap", () => {
    const out = restoreSwaps([log("item-1", 1, "db", "other"), log("item-1", 2, null)], exercises);
    expect(out).toEqual({});
  });

  it("keeps items independent and tolerates an unknown reason or a hidden exercise", () => {
    const out = restoreSwaps(
      [log("item-1", 1, "cable", "bogus"), log("item-2", 1, "gone", "other"), log("item-3", 1, null)],
      exercises
    );
    expect(out).toEqual({ "item-1": { exercise: exercises[1], reason: null } });
  });
});
