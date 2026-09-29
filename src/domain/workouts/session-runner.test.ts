import { describe, expect, it } from "vitest";
import {
  buildSteps,
  exerciseSummaries,
  mmss,
  nextOpenStep,
  parseDecimal,
  prefillDraft,
  previousSetLog,
  shouldRest,
  stepValue,
} from "./session-runner";

const items = [
  { id: "a", order_index: 0, group_key: null, setCount: 2 },
  { id: "b1", order_index: 1, group_key: "g", setCount: 2 },
  { id: "b2", order_index: 2, group_key: "g", setCount: 2 },
];

function loggedSet(...keys: string[]) {
  const set = new Set(keys);
  return (itemId: string, setIndex: number) => set.has(`${itemId}-${setIndex}`);
}

describe("buildSteps", () => {
  it("uses 1-based set indexes and round-robins groups", () => {
    expect(buildSteps(items).map((s) => `${s.itemId}-${s.setIndex}`)).toEqual([
      "a-1", "a-2", "b1-1", "b2-1", "b1-2", "b2-2",
    ]);
  });
});

describe("nextOpenStep", () => {
  const steps = buildSteps(items);

  it("moves to the next set of the same exercise", () => {
    expect(nextOpenStep(steps, loggedSet("a-1"), steps[0])).toMatchObject({ itemId: "a", setIndex: 2 });
  });

  it("alternates superset partners within a round", () => {
    const logged = loggedSet("a-1", "a-2", "b1-1");
    expect(nextOpenStep(steps, logged, steps[2])).toMatchObject({ itemId: "b2", setIndex: 1 });
  });

  it("wraps around to a set left open earlier", () => {
    const logged = loggedSet("a-2", "b1-1", "b2-1", "b1-2", "b2-2");
    expect(nextOpenStep(steps, logged, steps[5])).toMatchObject({ itemId: "a", setIndex: 1 });
  });

  it("scans from the start without an anchor and returns null when all logged", () => {
    expect(nextOpenStep(steps, loggedSet())).toMatchObject({ itemId: "a", setIndex: 1 });
    const all = loggedSet("a-1", "a-2", "b1-1", "b2-1", "b1-2", "b2-2");
    expect(nextOpenStep(steps, all, steps[0])).toBeNull();
  });
});

describe("shouldRest", () => {
  const steps = buildSteps(items);

  it("always rests after an ungrouped set", () => {
    expect(shouldRest(steps[0], items, loggedSet("a-1"))).toBe(true);
  });

  it("rests after a superset only once the round is complete", () => {
    expect(shouldRest(steps[2], items, loggedSet("b1-1"))).toBe(false);
    expect(shouldRest(steps[3], items, loggedSet("b1-1", "b2-1"))).toBe(true);
  });
});

describe("prefill", () => {
  const target = { weight: 60, reps: 10, duration_seconds: null };

  it("picks the latest earlier set logged in this workout", () => {
    const logs = [
      { set_index: 1, weight: 50 },
      { set_index: 3, weight: 70 },
      { set_index: 2, weight: 55 },
    ];
    expect(previousSetLog(logs, 3)).toEqual({ set_index: 2, weight: 55 });
    expect(previousSetLog(logs, 1)).toBeNull();
  });

  it("uses the previous set when there is one, else the target", () => {
    expect(prefillDraft(null, target)).toEqual(target);
    expect(prefillDraft({ weight: 62.5, reps: 8, duration_seconds: null }, target)).toEqual({
      weight: 62.5,
      reps: 8,
      duration_seconds: null,
    });
  });
});

describe("numeric input", () => {
  it("parses commas, Arabic separators and Arabic-Indic digits", () => {
    expect(parseDecimal("62,5")).toBe(62.5);
    expect(parseDecimal("٦٢٫٥")).toBe(62.5);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("-5")).toBeNull();
  });

  it("steps and clamps at zero, snapping weight to 0.25", () => {
    expect(stepValue("60", 2.5, 0.25)).toBe("62.5");
    expect(stepValue("1", -2.5, 0.25)).toBe("0");
    expect(stepValue("", 1)).toBe("1");
    expect(stepValue("10", -1)).toBe("9");
  });
});

describe("exerciseSummaries", () => {
  it("counts sets and top weight per exercise, bodyweight → null", () => {
    const logs = [
      { program_item_id: "a", weight: 60 },
      { program_item_id: "a", weight: 65 },
      { program_item_id: "b1", weight: null },
    ];
    expect(exerciseSummaries([{ id: "a", setCount: 3 }, { id: "b1", setCount: 2 }], logs)).toEqual([
      { itemId: "a", done: 2, total: 3, topWeight: 65 },
      { itemId: "b1", done: 1, total: 2, topWeight: null },
    ]);
  });
});

describe("mmss", () => {
  it("formats seconds as m:ss and clamps negatives", () => {
    expect(mmss(0)).toBe("0:00");
    expect(mmss(75)).toBe("1:15");
    expect(mmss(3134)).toBe("52:14");
    expect(mmss(-3)).toBe("0:00");
  });
});
