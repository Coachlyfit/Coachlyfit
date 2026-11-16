import { describe, expect, it } from "vitest";
import { groupSupersets, parseRest, parseSets } from "./scraped-sets";

const r = (reps: number | null, reps_max: number | null = null, duration_seconds: number | null = null) => ({
  reps,
  reps_max,
  duration_seconds,
});

describe("parseSets", () => {
  it("expands a per-set list", () => {
    expect(parseSets("3", "12, 12, 12").sets).toEqual([r(12), r(12), r(12)]);
    expect(parseSets("4", "12,10, 8, 6").sets).toEqual([r(12), r(10), r(8), r(6)]);
  });
  it("treats 3+ dash-separated numbers as a per-set list, even with a stray dash", () => {
    expect(parseSets("3", "12-12-12").sets).toEqual([r(12), r(12), r(12)]);
    expect(parseSets("3", "-12-12-12").sets).toHaveLength(3);
  });
  it("keeps a two-number dash as a range, repeated per set", () => {
    expect(parseSets("3", "10-12").sets).toEqual([r(10, 12), r(10, 12), r(10, 12)]);
    expect(parseSets("2", "10 - 12").sets).toEqual([r(10, 12), r(10, 12)]);
    expect(parseSets("2", "10-10").sets).toEqual([r(10), r(10)]);
  });
  it("repeats a single number", () => {
    expect(parseSets("3", "15").sets).toEqual([r(15), r(15), r(15)]);
  });
  it("reads durations in seconds and minutes", () => {
    expect(parseSets("3", "20 Sec").sets).toEqual([r(null, null, 20), r(null, null, 20), r(null, null, 20)]);
    expect(parseSets("1", "5 min").sets).toEqual([r(null, null, 300)]);
    expect(parseSets("2", "10-15 sec")).toMatchObject({ flags: ["duration_range:10-15 sec"] });
  });
  it("takes the lower bound of a sets range and flags it", () => {
    const p = parseSets("2-3", "10");
    expect(p.sets).toHaveLength(2);
    expect(p.flags).toEqual(["sets_range:2-3"]);
  });
  it("flags a list that disagrees with the declared set count", () => {
    expect(parseSets("4", "10, 10, 10").flags).toEqual(["sets_vs_reps:4/3"]);
  });
  it("reads a warm-up label as normal numbers plus a 'warmup' flag", () => {
    const p = parseSets("2", "10-15 warming");
    expect(p.sets).toEqual([r(10, 15), r(10, 15)]);
    expect(p.flags).toEqual(["warmup"]);
    expect(parseSets("2-3", "10-15 Warm-up").flags).toEqual(["warmup", "sets_range:2-3"]);
    const timed = parseSets("1", "8-10 min warming");
    expect(timed.sets).toEqual([r(null, null, 480)]);
    expect(timed.flags).toEqual(["warmup", "duration_range:8-10 min"]);
  });
  it("reads 'Max' as to-failure sets without inventing a rep count", () => {
    const p = parseSets("3", "Max");
    expect(p.sets).toEqual([
      { reps: null, reps_max: null, duration_seconds: null, to_failure: true },
      { reps: null, reps_max: null, duration_seconds: null, to_failure: true },
      { reps: null, reps_max: null, duration_seconds: null, to_failure: true },
    ]);
    expect(parseSets("x", "Max").sets).toBeNull();
  });
  it("reads a sprint label as a timed set and flags it", () => {
    const p = parseSets("1", "20 sec - Sprint");
    expect(p.sets).toEqual([r(null, null, 20)]);
    expect(p.flags).toEqual(["sprint"]);
    expect(parseSets("1", "20 sec- Sprint").sets).toEqual([r(null, null, 20)]);
  });
  it("accepts a typo'd list only when it matches the declared set count", () => {
    const p = parseSets("3", "12 12, 12");
    expect(p.sets).toEqual([r(12), r(12), r(12)]);
    expect(p.flags).toEqual(["typo_fixed:12 12, 12"]);
    expect(parseSets("3", "10 12").sets).toBeNull(); // 2 numbers for 3 sets: ambiguous
    expect(parseSets("3", "10 10, 110").sets).toBeNull(); // 110 reps is not a rep count
  });
  it("reads a warm-up label in the sets cell too", () => {
    const p = parseSets("2-3 warm-up", "10-15");
    expect(p.sets).toEqual([r(10, 15), r(10, 15)]);
    expect(p.flags).toEqual(["warmup", "sets_range:2-3"]);
    expect(parseSets("3-4 Warm-up", "12").sets).toHaveLength(3);
  });
  it("returns null with a flag instead of guessing", () => {
    expect(parseSets("3", "% 80 max pace")).toEqual({ sets: null, flags: ["unparsed_reps:% 80 max pace"] });
    expect(parseSets("3", "50 - 135 pounds").sets).toBeNull();
    expect(parseSets("3", "10+10 Sec (Right-Left)").sets).toBeNull();
    expect(parseSets("1 x 200 m sprint", "12").sets).toBeNull();
    expect(parseSets("3", null)).toEqual({ sets: null, flags: ["no_reps"] });
  });
});

describe("parseRest", () => {
  it("takes the lower bound in seconds", () => {
    expect(parseRest('30"', null).rest_seconds).toBe(30);
    expect(parseRest('45-60"', null).rest_seconds).toBe(45);
    expect(parseRest("45-60", null).rest_seconds).toBe(45);
    expect(parseRest('20-30" sec', null).rest_seconds).toBe(20);
    expect(parseRest("10 Sec", null).rest_seconds).toBe(10);
  });
  it("is empty for a missing cell and flags unknown text", () => {
    expect(parseRest(null, null)).toEqual({ rest_seconds: null, marker: null, flags: [] });
    expect(parseRest("minimum", null).flags).toEqual(["unparsed_rest:minimum"]);
  });
  it("reads the superset marker from the rest cell and the real rest from the duration cell", () => {
    expect(parseRest("Superset 1", "60-120 Sec")).toEqual({ rest_seconds: 60, marker: "end", flags: [] });
    expect(parseRest("Super Set", null)).toEqual({ rest_seconds: null, marker: "pair", flags: [] });
  });
});

describe("groupSupersets", () => {
  const row = (marker: "pair" | "end" | null) => ({ marker, rest_seconds: null });

  it("pairs each 'Superset N' row with the unmarked row before it", () => {
    const { keys } = groupSupersets([row(null), row("end"), row(null), row("end"), row(null), row("end")]);
    expect(keys).toEqual(["ss1", "ss1", "ss2", "ss2", "ss3", "ss3"]);
  });
  it("pairs consecutive 'Super Set' rows two at a time", () => {
    const { keys } = groupSupersets([row(null), row(null), row("pair"), row("pair"), row("pair"), row("pair"), row(null)]);
    expect(keys).toEqual([null, null, "ss1", "ss1", "ss2", "ss2", null]);
  });
  it("flags a marker it cannot place", () => {
    expect(groupSupersets([row("pair"), row(null)]).flags).toEqual(["superset_unplaced:1"]);
    expect(groupSupersets([row("end")]).flags).toEqual(["superset_unplaced:1"]);
  });
});
