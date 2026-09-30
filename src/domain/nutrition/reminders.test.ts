import { describe, expect, it } from "vitest";
import { dueReminderDate, isValidTimeZone, localDateTime, type ReminderSettings } from "./reminders";

const settings: ReminderSettings = {
  enabled: true,
  remind_at: "20:00:00",
  timezone: "Asia/Riyadh", // UTC+3, no DST
  last_reminded_on: null,
};

describe("localDateTime", () => {
  it("converts to the zone's wall clock", () => {
    expect(localDateTime(new Date("2026-09-30T17:05:00Z"), "Asia/Riyadh")).toEqual({ date: "2026-09-30", time: "20:05" });
  });

  it("crosses the date line for far-east zones", () => {
    expect(localDateTime(new Date("2026-09-30T12:00:00Z"), "Pacific/Kiritimati")).toEqual({
      date: "2026-10-01",
      time: "02:00",
    });
    expect(localDateTime(new Date("2026-09-30T08:00:00Z"), "Pacific/Pago_Pago")).toEqual({
      date: "2026-09-29",
      time: "21:00",
    });
  });

  it("follows DST (New York springs forward 2026-03-08)", () => {
    expect(localDateTime(new Date("2026-03-07T12:00:00Z"), "America/New_York").time).toBe("07:00");
    expect(localDateTime(new Date("2026-03-09T12:00:00Z"), "America/New_York").time).toBe("08:00");
  });

  it("uses 00 for midnight, not 24", () => {
    expect(localDateTime(new Date("2026-09-30T21:00:00Z"), "Asia/Riyadh")).toEqual({ date: "2026-10-01", time: "00:00" });
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimeZone("Africa/Cairo")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("dueReminderDate", () => {
  const at = (iso: string) => new Date(iso);

  it("is due at or after the chosen local time", () => {
    expect(dueReminderDate(settings, at("2026-09-30T16:59:00Z"), new Set())).toBeNull();
    expect(dueReminderDate(settings, at("2026-09-30T17:00:00Z"), new Set())).toBe("2026-09-30");
  });

  it("accepts HH:MM as well as HH:MM:SS", () => {
    expect(dueReminderDate({ ...settings, remind_at: "20:00" }, at("2026-09-30T17:00:00Z"), new Set())).toBe(
      "2026-09-30"
    );
  });

  it("is not due when disabled", () => {
    expect(dueReminderDate({ ...settings, enabled: false }, at("2026-09-30T18:00:00Z"), new Set())).toBeNull();
  });

  it("reminds at most once per local day", () => {
    expect(
      dueReminderDate({ ...settings, last_reminded_on: "2026-09-30" }, at("2026-09-30T18:00:00Z"), new Set())
    ).toBeNull();
    expect(
      dueReminderDate({ ...settings, last_reminded_on: "2026-09-29" }, at("2026-09-30T18:00:00Z"), new Set())
    ).toBe("2026-09-30");
  });

  it("is not due when the local day is already logged", () => {
    expect(dueReminderDate(settings, at("2026-09-30T18:00:00Z"), new Set(["2026-09-30"]))).toBeNull();
  });

  it("checks the log against the client's local date, not UTC", () => {
    // A log for the UTC date (the 30th) doesn't count for the client's local day (the 1st).
    const kiritimati = { ...settings, timezone: "Pacific/Kiritimati", remind_at: "08:00" };
    // 2026-09-30T20:00Z is 10:00 on Oct 1 in Kiritimati (UTC+14).
    expect(dueReminderDate(kiritimati, at("2026-09-30T20:00:00Z"), new Set(["2026-09-30"]))).toBe("2026-10-01");
  });

  it("never reminds with an invalid timezone", () => {
    expect(dueReminderDate({ ...settings, timezone: "Nope/Nowhere" }, at("2026-09-30T18:00:00Z"), new Set())).toBeNull();
  });
});
