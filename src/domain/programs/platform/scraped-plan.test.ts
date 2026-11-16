import { describe, expect, it } from "vitest";
import {
  cleanDayTitle,
  genderTarget,
  isRestTitle,
  parseDurationWeeks,
  planGoal,
  planLevel,
  trainingDaysPerWeek,
  uniqueWorkoutSlugs,
  type PlanDay,
} from "./scraped-plan";

const day = (n: number, rest: boolean, slug: string | null = rest ? null : `w${n}`): PlanDay => ({
  day: n,
  title: rest ? "REST" : "Workout",
  slug,
  rest,
});

describe("scraped-plan basics", () => {
  it("reads durations", () => {
    expect(parseDurationWeeks("4 Weeks")).toBe(4);
    expect(parseDurationWeeks(" 1 Week ")).toBe(1);
    expect(parseDurationWeeks("")).toBeNull();
    expect(parseDurationWeeks(null)).toBeNull();
  });
  it("detects rest days", () => {
    expect(isRestTitle("REST")).toBe(true);
    expect(isRestTitle(" Rest Day ")).toBe(true);
    expect(isRestTitle("Day 3 (REST)")).toBe(true);
    expect(isRestTitle("Day 7 - Rest")).toBe(true);
    expect(isRestTitle("Day 4 (Hypertrophy - Upper Body)")).toBe(false);
    expect(isRestTitle("Rest and Recovery Workout")).toBe(false);
    expect(isRestTitle("5×5 Workout A")).toBe(false);
  });
  it("strips the trailing week marker but nothing else", () => {
    expect(cleanDayTitle("Strength Training 2. Week")).toBe("Strength Training");
    expect(cleanDayTitle("Power Workout 3.Week")).toBe("Power Workout");
    expect(cleanDayTitle("Upper Body Strength 8. Week")).toBe("Upper Body Strength");
    expect(cleanDayTitle("5×5 Workout A")).toBe("5×5 Workout A");
    expect(cleanDayTitle("Week 1 Warm-up")).toBe("Week 1 Warm-up");
  });
  it("maps gender", () => {
    expect(genderTarget("Female, Male")).toBe("all");
    expect(genderTarget("Female")).toBe("female");
    expect(genderTarget(" Male ")).toBe("male");
    expect(genderTarget("")).toBeNull();
  });
  it("maps goal, first listed wins", () => {
    expect(planGoal("Build Muscle")).toBe("muscle");
    expect(planGoal("Lose Fat")).toBe("fat_loss");
    expect(planGoal("Build Muscle, Lose Fat")).toBe("muscle");
    expect(planGoal("Lose Fat, Build Muscle")).toBe("fat_loss");
    expect(planGoal("")).toBeNull();
  });
});

describe("trainingDaysPerWeek", () => {
  it("counts training days in the typical week", () => {
    // 2 weeks: A, rest, B, rest, A, rest, rest  /  B, rest, A, rest, B, rest, rest
    const rest = new Set([2, 4, 6, 7, 9, 11, 13, 14]);
    const days = Array.from({ length: 14 }, (_, i) => day(i + 1, rest.has(i + 1)));
    expect(trainingDaysPerWeek(days, 2)).toBe(3);
  });
  it("ignores one odd week, and is null for an all-rest plan", () => {
    const days = [
      ...[1, 2, 3, 4].map((n) => day(n, false)), ...[5, 6, 7].map((n) => day(n, true)),
      ...[8, 9, 10, 11].map((n) => day(n, false)), ...[12, 13, 14].map((n) => day(n, true)),
      ...[15, 16].map((n) => day(n, false)), ...[17, 18, 19, 20, 21].map((n) => day(n, true)),
    ];
    expect(trainingDaysPerWeek(days, 3)).toBe(4);
    expect(trainingDaysPerWeek(Array.from({ length: 7 }, (_, i) => day(i + 1, true)), 1)).toBeNull();
    expect(trainingDaysPerWeek([], 0)).toBeNull();
  });
});

describe("planLevel", () => {
  it("prefers a level named in the title", () => {
    expect(planLevel("8-Week Advanced Powerlifting Program", [["intermediate"]])).toBe("advanced");
    expect(planLevel("6-Day PPL Workout Program For Beginners", [["advanced"]])).toBe("beginner");
  });
  it("else the lowest level on its workouts, else null", () => {
    expect(planLevel("5x5 Workout Plan", [["intermediate", "advanced"], ["beginner"]])).toBe("beginner");
    expect(planLevel("Mystery Plan", [[]])).toBeNull();
  });
});

describe("uniqueWorkoutSlugs", () => {
  it("lists each training page once, in order, skipping rest days", () => {
    const days = [day(1, false, "a"), day(2, true), day(3, false, "b"), day(4, false, "a")];
    expect(uniqueWorkoutSlugs(days)).toEqual(["a", "b"]);
  });
});
