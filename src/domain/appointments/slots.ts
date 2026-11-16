import { addDays, localDateTime, weekdayOf, zonedToUtc } from "./tz";

export type AvailabilityRule = {
  /** 0 = Sunday. */
  weekday: number;
  /** Postgres `time`: "HH:MM" or "HH:MM:SS". */
  start_time: string;
  end_time: string;
  /** IANA zone the hours are written in. */
  timezone: string;
};

export type AvailabilityException = {
  /** YYYY-MM-DD in the rule's zone. */
  date: string;
  is_off: boolean;
  start_time: string | null;
  end_time: string | null;
};

export type Interval = { start: Date; end: Date };

export type SlotInput = {
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  /** Existing appointments (requested + confirmed). */
  busy: Interval[];
  /** Other blocked time, e.g. Google freebusy (not wired yet). */
  extraBusy?: Interval[];
  from: Date;
  to: Date;
  slotMinutes: number;
  minNoticeHours: number;
  now: Date;
};

const overlaps = (a: Interval, b: Interval) => a.start < b.end && a.end > b.start;

/** Bookable slots in [from, to): the weekly hours, overridden per day by an
 * exception (day off, or custom hours), cut into `slotMinutes` pieces, minus
 * anything busy or inside the notice window. Hours are interpreted in each
 * rule's own zone, so DST shifts move the UTC instants, not the wall clock.
 *
 * ponytail: a window whose start or end falls inside a spring-forward gap is
 * skipped whole. Rare (needs hours set at 02:00-ish), add trimming if it bites. */
export function generateSlots(input: SlotInput): Interval[] {
  const { rules, exceptions, busy, extraBusy = [], from, to, slotMinutes, minNoticeHours, now } = input;
  const earliest = new Date(now.getTime() + minNoticeHours * 3_600_000);
  const blocked = [...busy, ...extraBusy];
  const step = slotMinutes * 60_000;
  const out = new Map<number, Interval>();

  for (const tz of new Set(rules.map((r) => r.timezone))) {
    const tzRules = rules.filter((r) => r.timezone === tz);
    const last = localDateTime(new Date(to.getTime() - 1), tz).date;
    for (let date = localDateTime(from, tz).date; date <= last; date = addDays(date, 1)) {
      const exception = exceptions.find((e) => e.date === date);
      if (exception?.is_off) continue;
      const windows = exception
        ? [{ start: exception.start_time!, end: exception.end_time! }]
        : tzRules
            .filter((r) => r.weekday === weekdayOf(date))
            .map((r) => ({ start: r.start_time, end: r.end_time }));

      for (const w of windows) {
        const start = zonedToUtc(date, w.start, tz);
        const end = zonedToUtc(date, w.end, tz);
        if (!start || !end) continue;
        for (let t = start.getTime(); t + step <= end.getTime(); t += step) {
          const slot = { start: new Date(t), end: new Date(t + step) };
          if (slot.start < from || slot.end > to || slot.start < earliest) continue;
          if (blocked.some((b) => overlaps(slot, b))) continue;
          out.set(t, slot);
        }
      }
    }
  }

  return [...out.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Is `slot` one of the generated slots? Server actions use this so a client
 * can't request a time the coach never offered. */
export function isOfferedSlot(slots: Interval[], start: Date, end: Date): boolean {
  return slots.some((s) => s.start.getTime() === start.getTime() && s.end.getTime() === end.getTime());
}
