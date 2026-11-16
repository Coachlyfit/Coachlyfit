import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, icsStatus } from "./ics";

const event = {
  id: "abc-123",
  start: new Date("2026-01-18T07:00:00Z"),
  end: new Date("2026-01-18T08:00:00Z"),
  summary: "Sara; Online, session",
  location: "https://meet.example/x",
  status: "CONFIRMED" as const,
};

describe("buildIcs", () => {
  const ics = buildIcs([event], { calName: "Coachly Fit", now: new Date("2026-01-10T12:30:45.123Z") });

  it("is a CRLF calendar with a stable UID and UTC times", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:appt-abc-123@coachlyfit\r\n");
    expect(ics).toContain("DTSTART:20260118T070000Z\r\n");
    expect(ics).toContain("DTEND:20260118T080000Z\r\n");
    expect(ics).toContain("DTSTAMP:20260110T123045Z\r\n");
  });

  it("escapes separators in text", () => {
    expect(ics).toContain("SUMMARY:Sara\\; Online\\, session\r\n");
  });

  it("omits empty optional fields", () => {
    const out = buildIcs([{ ...event, location: null }], { calName: "x" });
    expect(out).not.toContain("LOCATION");
    expect(out).not.toContain("DESCRIPTION");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:hi")).toBe("SUMMARY:hi");
  });

  it("folds at 75 octets without splitting Arabic characters", () => {
    const folded = foldLine("SUMMARY:" + "جلسة تدريب ".repeat(20));
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    for (const line of lines.slice(1)) expect(line.startsWith(" ")).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "جلسة تدريب ".repeat(20));
  });
});

describe("icsStatus", () => {
  it("maps appointment statuses", () => {
    expect(icsStatus("requested")).toBe("TENTATIVE");
    expect(icsStatus("cancelled")).toBe("CANCELLED");
    expect(icsStatus("confirmed")).toBe("CONFIRMED");
    expect(icsStatus("completed")).toBe("CONFIRMED");
  });
});
