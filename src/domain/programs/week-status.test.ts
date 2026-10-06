import { describe, expect, it } from "vitest";
import { adherence, programStatus, weekCells, type OverviewProgram } from "./week-status";

// 2026-10-03 is a Saturday.
const WEEK = "2026-10-03";

function day(
  day_index: number,
  opts: { weekday?: number; items?: number; sessions?: [string, boolean][] } = {}
): OverviewProgram["program_days"][number] {
  return {
    id: `day-${day_index}`,
    day_index,
    weekday: opts.weekday ?? null,
    label_ar: `يوم ${day_index}`,
    label_en: `Day ${day_index}`,
    program_items: [{ count: opts.items ?? 3 }],
    workout_sessions: (opts.sessions ?? []).map(([date, completed]) => ({
      started_at: `${date}T10:00:00.000Z`,
      completed_at: completed ? `${date}T11:00:00.000Z` : null,
    })),
  };
}

const statuses = (program: OverviewProgram, today: string, week = WEEK) =>
  weekCells(program, week, today).map((c) => c.status);

describe("weekCells", () => {
  it("weekly mode: pins days to weekdays, rest elsewhere, split by today", () => {
    const program: OverviewProgram = {
      start_date: "2026-09-01",
      schedule_mode: "weekly",
      // Saturday (6), Monday (1), Wednesday (3)
      program_days: [
        day(1, { weekday: 6, sessions: [["2026-10-03", true]] }),
        day(2, { weekday: 1 }),
        day(3, { weekday: 3 }),
      ],
    };
    // today = Tuesday 06.10: Sat done, Mon missed, Wed upcoming
    expect(statuses(program, "2026-10-06")).toEqual(["done", "rest", "missed", "rest", "upcoming", "rest", "rest"]);
  });

  it("a planned workout today is upcoming, not missed", () => {
    const program: OverviewProgram = {
      start_date: "2026-09-01",
      schedule_mode: "weekly",
      program_days: [day(1, { weekday: 1 })],
    };
    expect(statuses(program, "2026-10-05")[2]).toBe("upcoming");
    expect(statuses(program, "2026-10-06")[2]).toBe("missed");
  });

  it("an in-progress session (no completed_at) is not done", () => {
    const program: OverviewProgram = {
      start_date: "2026-09-01",
      schedule_mode: "weekly",
      program_days: [day(1, { weekday: 6, sessions: [["2026-10-03", false]] })],
    };
    expect(statuses(program, "2026-10-06")[0]).toBe("missed");
  });

  it("a workout done a day late still counts for its slot", () => {
    const program: OverviewProgram = {
      start_date: "2026-09-01",
      schedule_mode: "weekly",
      program_days: [day(1, { weekday: 6, sessions: [["2026-10-04", true]] })],
    };
    expect(statuses(program, "2026-10-06")[0]).toBe("done");
  });

  it("cycle mode: a short cycle repeats a day in one week, one session fills one slot", () => {
    const program: OverviewProgram = {
      start_date: WEEK,
      schedule_mode: "cycle",
      // 3-day cycle: day 1 lands on Sat, Tue, Fri; day 3 has no items (rest)
      program_days: [day(1, { sessions: [["2026-10-06", true]] }), day(2), day(3, { items: 0 })],
    };
    expect(statuses(program, "2026-10-07")).toEqual(["missed", "missed", "rest", "done", "upcoming", "rest", "upcoming"]);
  });

  it("ignores sessions from another week and dates before start_date", () => {
    const program: OverviewProgram = {
      start_date: "2026-10-05",
      schedule_mode: "cycle",
      program_days: [day(1, { sessions: [["2026-09-28", true]] })],
    };
    expect(statuses(program, "2026-10-06")).toEqual(["rest", "rest", "missed", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });
});

describe("programStatus / adherence", () => {
  const cells = (s: string) =>
    [...s].map((c) => ({
      date: WEEK,
      status: ({ d: "done", m: "missed", u: "upcoming", r: "rest" } as const)[c as "d"],
      label_ar: null,
      label_en: null,
    }));

  it("derives status from start date and missed workouts", () => {
    expect(programStatus("2026-10-10", cells("rrrrrrr"), "2026-10-06")).toBe("notStarted");
    expect(programStatus("2026-09-01", cells("ddmuurr"), "2026-10-06")).toBe("behind");
    expect(programStatus("2026-09-01", cells("ddruurr"), "2026-10-06")).toBe("ongoing");
  });

  it("adherence counts only workouts already due", () => {
    expect(adherence(cells("dddmuur"))).toBe(75);
    expect(adherence(cells("drmduru"))).toBe(67);
    expect(adherence(cells("uuurrrr"))).toBeNull();
  });
});
