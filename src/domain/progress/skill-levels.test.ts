import { describe, expect, it } from "vitest";
import { computeSkillLadders, hasLoggedEffort, toSkillRung, type SkillRung } from "./skill-levels";

const rung = (id: string, group: SkillRung["group"], level: number): SkillRung => ({
  id,
  name_ar: id,
  name_en: id,
  group,
  level,
});

const planche = [rung("lean", "planche", 1), rung("tuck", "planche", 2), rung("adv", "planche", 3), rung("full", "planche", 5)];
const lever = [rung("tl", "front_lever", 1), rung("fl", "front_lever", 4)];

describe("computeSkillLadders", () => {
  it("reports the highest logged rung, flags reached levels and points at the next rung", () => {
    const [ladder] = computeSkillLadders([...planche, ...lever], new Set(["lean", "tuck"]));
    expect(ladder.group).toBe("planche");
    expect(ladder.reachedLevel).toBe(2);
    expect(ladder.rungs.map((r) => [r.id, r.reached])).toEqual([
      ["lean", true],
      ["tuck", true],
      ["adv", false],
      ["full", false],
    ]);
    expect(ladder.next?.id).toBe("adv");
  });

  it("skips ladders the athlete never logged and keeps the fixed group order", () => {
    const ladders = computeSkillLadders([...lever, ...planche], new Set(["fl", "lean"]));
    expect(ladders.map((l) => l.group)).toEqual(["planche", "front_lever"]); // SKILL_GROUPS order, not input order (levers were passed first)
    expect(computeSkillLadders([...planche], new Set())).toEqual([]);
  });

  it("has no next rung at the top, and a skipped rung does not count as reached", () => {
    const [ladder] = computeSkillLadders(planche, new Set(["full"]));
    expect(ladder.reachedLevel).toBe(5);
    expect(ladder.next).toBeNull();
    expect(ladder.rungs.find((r) => r.id === "tuck")?.reached).toBe(false);
  });

  it("treats two library rows at one level as one rung, reached if either was logged", () => {
    const dup = [rung("pull-a", "pull_up", 3), rung("pull-b", "pull_up", 3), rung("arch", "pull_up", 4)];
    const [ladder] = computeSkillLadders(dup, new Set(["pull-b"]));
    expect(ladder.rungs).toHaveLength(2);
    expect(ladder.rungs[0].reached).toBe(true);
    expect(ladder.next?.id).toBe("arch");
  });
});

describe("toSkillRung / hasLoggedEffort", () => {
  it("narrows a DB row and rejects unknown ladders", () => {
    expect(toSkillRung({ id: "a", name_ar: "x", name_en: "y", skill_group: "planche", skill_level: 2 })).toMatchObject({ group: "planche", level: 2 });
    expect(toSkillRung({ id: "a", name_ar: "x", name_en: "y", skill_group: "nope", skill_level: 2 })).toBeNull();
    expect(toSkillRung({ id: "a", name_ar: "x", name_en: "y", skill_group: null, skill_level: null })).toBeNull();
  });

  it("counts a rep or a held second, nothing less", () => {
    expect(hasLoggedEffort({ reps: 1 })).toBe(true);
    expect(hasLoggedEffort({ reps: null, duration_seconds: 5 })).toBe(true);
    expect(hasLoggedEffort({ reps: 0, duration_seconds: 0 })).toBe(false);
    expect(hasLoggedEffort({ reps: null })).toBe(false);
  });
});
