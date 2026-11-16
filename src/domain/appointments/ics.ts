export type IcsStatus = "TENTATIVE" | "CONFIRMED" | "CANCELLED";

export type IcsEvent = {
  /** Stable id: becomes UID, so calendars update instead of duplicating. */
  id: string;
  start: Date;
  end: Date;
  summary: string;
  location?: string | null;
  description?: string | null;
  status: IcsStatus;
};

const encoder = new TextEncoder();

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 folding: lines are at most 75 octets, continuation lines start
 * with a space. Counts UTF-8 bytes and never splits a character, which
 * matters for Arabic names. */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // the leading space on continuation lines counts
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcs(events: IcsEvent[], opts: { calName: string; now?: Date }): string {
  const stamp = utc(opts.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Coachly Fit//Appointments//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.calName)}`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:appt-${e.id}@coachlyfit`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utc(e.start)}`,
      `DTEND:${utc(e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      `STATUS:${e.status}`,
    );
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function icsStatus(status: string): IcsStatus {
  if (status === "requested") return "TENTATIVE";
  if (status === "cancelled") return "CANCELLED";
  return "CONFIRMED";
}
