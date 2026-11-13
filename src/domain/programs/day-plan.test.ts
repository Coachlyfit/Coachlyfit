import { describe, expect, it } from "vitest";
import { activePhase, resolveDayPlan } from "./day-plan";
import type { ProgramTree } from "./programs.service";

/** Minimal cycle-mode tree: 3 days (Mon strength, Tue rest, Wed rehab+cardio),
 * cycling from 2026-08-01 (a Saturday). Only the fields resolveDayPlan/
 * activePhase actually read are filled in — everything else on the row
 * types is irrelevant to this pure module. */
function buildTree(overrides: Partial<ProgramTree> = {}): ProgramTree {
  return {
    id: "program-1",
    coach_id: "coach-1",
    client_id: "client-1",
    start_date: "2026-08-01",
    schedule_mode: "cycle",
    program_days: [
      {
        id: "day-1",
        day_index: 1,
        weekday: null,
        diet_plan_id: "diet-training",
        program_items: [
          { id: "item-1", block: "main", rehab_phase_id: null },
        ],
        program_activities: [],
      },
      {
        id: "day-2",
        day_index: 2,
        weekday: null,
        diet_plan_id: "diet-rest",
        program_items: [],
        program_activities: [],
      },
      {
        id: "day-3",
        day_index: 3,
        weekday: null,
        diet_plan_id: null,
        program_items: [
          { id: "item-2", block: "rehab", rehab_phase_id: "phase-early" },
          { id: "item-3", block: "rehab", rehab_phase_id: "phase-late" },
        ],
        program_activities: [{ id: "activity-1", kind: "cardio", order_index: 0 }],
      },
    ],
    rehab_protocols: [
      {
        id: "protocol-1",
        body_area: "knee",
        rehab_phases: [
          { id: "phase-early", from_week: 1, to_week: 2 },
          { id: "phase-late", from_week: 3, to_week: 6 },
        ],
      },
    ],
    diet_variants: [],
    ...overrides,
  } as unknown as ProgramTree;
}

describe("activePhase", () => {
  const protocol = buildTree().rehab_protocols[0];

  it("returns the phase whose week range contains the given week", () => {
    expect(activePhase(protocol, 1)?.id).toBe("phase-early");
    expect(activePhase(protocol, 4)?.id).toBe("phase-late");
  });

  it("returns null for a week that falls in a gap between phases", () => {
    const gappy = { ...protocol, rehab_phases: [{ id: "a", from_week: 1, to_week: 2 } as never] };
    expect(activePhase(gappy, 5)).toBeNull();
  });
});

describe("resolveDayPlan", () => {
  it("classifies a day with main-block items as training", () => {
    const plan = resolveDayPlan(buildTree(), "2026-08-01"); // day 1
    expect(plan.kind).toBe("training");
    expect(plan.workoutItems).toHaveLength(1);
    expect(plan.dietPlanId).toBe("diet-training");
  });

  it("classifies a day with no items and no activities as rest", () => {
    const plan = resolveDayPlan(buildTree(), "2026-08-02"); // day 2
    expect(plan.kind).toBe("rest");
    expect(plan.dietPlanId).toBe("diet-rest");
  });

  it("filters rehab items to only the phase active for the current week, and classifies as rehab", () => {
    // day 3 lands on 2026-08-03, week 1 -> phase-early (weeks 1-2) is active,
    // phase-late (weeks 3-6) is not yet -> item-3 is hidden.
    const plan = resolveDayPlan(buildTree(), "2026-08-03");
    expect(plan.kind).toBe("rehab");
    expect(plan.rehabItems.map((i) => i.id)).toEqual(["item-2"]);
  });

  it("shows a different rehab item once the program crosses into a later phase's week", () => {
    // day 3 recurs every 3 days; the 3rd cycle (day 3 again) lands on
    // 2026-08-09, which is week 2 (days 8-14 since start) -> still phase-early.
    // Push further to land in week 3: 2026-08-01 + 14 days = 2026-08-15 is
    // week 3, and day_index cycles back to day 3 (offset 14 % 3 === 2).
    const plan = resolveDayPlan(buildTree(), "2026-08-15");
    expect(plan.week).toBe(3);
    expect(plan.rehabItems.map((i) => i.id)).toEqual(["item-3"]);
  });

  it("returns every protocol with its active phase annotated, even without rehab items today", () => {
    const plan = resolveDayPlan(buildTree(), "2026-08-01"); // day 1, week 1
    expect(plan.protocols).toHaveLength(1);
    expect(plan.protocols[0].activePhase?.id).toBe("phase-early");
  });

  it("resolves no day (rest) for a date before the program starts", () => {
    const plan = resolveDayPlan(buildTree(), "2026-07-31");
    expect(plan.day).toBeNull();
    expect(plan.kind).toBe("rest");
  });
});

describe("resolveDayPlan with extra sessions", () => {
  it("resolves the calendar day by primary days only and returns the day's sessions", () => {
    const base = buildTree();
    const tree = buildTree({
      program_days: [
        ...base.program_days,
        // an AM/PM split on day 1: shares day_index 1, hangs off day-1
        { id: "day-1-pm", day_index: 1, parent_day_id: "day-1", weekday: null, diet_plan_id: null, program_items: [{ id: "item-9", block: "main", rehab_phase_id: null }], program_activities: [] },
      ] as ProgramTree["program_days"],
    });

    // 2026-08-01 is day 1 of a 3-day cycle; the extra session must not make it a 4-day cycle
    const day1 = resolveDayPlan(tree, "2026-08-01");
    expect(day1.day?.id).toBe("day-1");
    expect(day1.sessions.map((s) => s.id)).toEqual(["day-1-pm"]);
    // day 2 is next calendar day: still the rest day, not the session
    expect(resolveDayPlan(tree, "2026-08-02").day?.id).toBe("day-2");
    expect(resolveDayPlan(tree, "2026-08-02").sessions).toEqual([]);
    // the cycle repeats after 3 days, not 4
    expect(resolveDayPlan(tree, "2026-08-04").day?.id).toBe("day-1");
  });
});
