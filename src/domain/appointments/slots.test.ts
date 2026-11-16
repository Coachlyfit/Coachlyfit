import { describe, expect, it } from "vitest";
import { generateSlots, isOfferedSlot, type AvailabilityRule, type SlotInput } from "./slots";

const SUNDAY_MORNING: AvailabilityRule = {
  weekday: 0,
  start_time: "09:00:00",
  end_time: "12:00:00",
  timezone: "Africa/Cairo", // UTC+2 in January
};

const base: SlotInput = {
  rules: [SUNDAY_MORNING],
  exceptions: [],
  busy: [],
  from: new Date("2026-01-18T00:00:00Z"), // a Sunday
  to: new Date("2026-01-19T00:00:00Z"),
  slotMinutes: 60,
  minNoticeHours: 0,
  now: new Date("2026-01-10T00:00:00Z"),
};

const starts = (input: SlotInput) => generateSlots(input).map((s) => s.start.toISOString());

describe("generateSlots", () => {
  it("cuts the weekly window into slots, in the coach's timezone", () => {
    expect(starts(base)).toEqual([
      "2026-01-18T07:00:00.000Z",
      "2026-01-18T08:00:00.000Z",
      "2026-01-18T09:00:00.000Z",
    ]);
  });

  it("returns nothing on days with no rule", () => {
    expect(starts({ ...base, from: new Date("2026-01-19T00:00:00Z"), to: new Date("2026-01-20T00:00:00Z") })).toEqual([]);
  });

  it("removes slots overlapping existing appointments", () => {
    const busy = [{ start: new Date("2026-01-18T08:00:00Z"), end: new Date("2026-01-18T09:00:00Z") }];
    expect(starts({ ...base, busy })).toEqual(["2026-01-18T07:00:00.000Z", "2026-01-18T09:00:00.000Z"]);
  });

  it("treats extra busy time (Google freebusy) like appointments", () => {
    const extraBusy = [{ start: new Date("2026-01-18T07:30:00Z"), end: new Date("2026-01-18T08:10:00Z") }];
    expect(starts({ ...base, extraBusy })).toEqual(["2026-01-18T09:00:00.000Z"]);
  });

  it("a day-off exception removes the whole day", () => {
    expect(starts({ ...base, exceptions: [{ date: "2026-01-18", is_off: true, start_time: null, end_time: null }] })).toEqual([]);
  });

  it("an exception with hours replaces the weekly hours", () => {
    const exceptions = [{ date: "2026-01-18", is_off: false, start_time: "10:00", end_time: "12:00" }];
    expect(starts({ ...base, exceptions })).toEqual(["2026-01-18T08:00:00.000Z", "2026-01-18T09:00:00.000Z"]);
  });

  it("an exception can open a day that has no weekly rule", () => {
    const exceptions = [{ date: "2026-01-19", is_off: false, start_time: "09:00", end_time: "10:00" }];
    const out = starts({ ...base, exceptions, from: new Date("2026-01-19T00:00:00Z"), to: new Date("2026-01-20T00:00:00Z") });
    expect(out).toEqual(["2026-01-19T07:00:00.000Z"]);
  });

  it("drops slots inside the minimum-notice window", () => {
    const out = starts({ ...base, now: new Date("2026-01-18T06:30:00Z"), minNoticeHours: 2 });
    expect(out).toEqual(["2026-01-18T09:00:00.000Z"]);
  });

  it("drops a slot that would run past `to`", () => {
    expect(starts({ ...base, to: new Date("2026-01-18T08:30:00Z") })).toEqual(["2026-01-18T07:00:00.000Z"]);
  });

  it("merges overlapping rules without duplicate slots", () => {
    const rules = [SUNDAY_MORNING, { ...SUNDAY_MORNING, start_time: "10:00:00", end_time: "13:00:00" }];
    expect(starts({ ...base, rules })).toEqual([
      "2026-01-18T07:00:00.000Z",
      "2026-01-18T08:00:00.000Z",
      "2026-01-18T09:00:00.000Z",
      "2026-01-18T10:00:00.000Z",
    ]);
  });

  it("keeps wall-clock hours across a DST change (US spring-forward, 01:00-04:00 local)", () => {
    const rules: AvailabilityRule[] = [
      { weekday: 0, start_time: "01:00", end_time: "04:00", timezone: "America/New_York" },
    ];
    // 01:00 EST = 06:00Z; 04:00 EDT = 08:00Z -> only two real hours that morning.
    const out = starts({
      ...base,
      rules,
      from: new Date("2026-03-08T00:00:00Z"),
      to: new Date("2026-03-09T00:00:00Z"),
    });
    expect(out).toEqual(["2026-03-08T06:00:00.000Z", "2026-03-08T07:00:00.000Z"]);
  });
});

describe("isOfferedSlot", () => {
  it("only accepts an exact generated slot", () => {
    const slots = generateSlots(base);
    expect(isOfferedSlot(slots, new Date("2026-01-18T08:00:00Z"), new Date("2026-01-18T09:00:00Z"))).toBe(true);
    expect(isOfferedSlot(slots, new Date("2026-01-18T08:30:00Z"), new Date("2026-01-18T09:30:00Z"))).toBe(false);
  });
});
