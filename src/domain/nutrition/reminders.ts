export type ReminderSettings = {
  enabled: boolean;
  /** Postgres `time`: "HH:MM" or "HH:MM:SS". */
  remind_at: string;
  /** IANA zone, e.g. "Asia/Riyadh". */
  timezone: string;
  last_reminded_on: string | null;
};

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock date (YYYY-MM-DD) and time (HH:MM) at `now` in `tz`. */
export function localDateTime(now: Date, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** The client's local date to remind for, or null when no reminder is due:
 * disabled, before the chosen time, already reminded today, or already
 * logged today (all in the client's own timezone). An unknown timezone
 * never reminds rather than guessing UTC. */
export function dueReminderDate(settings: ReminderSettings, now: Date, loggedDates: Set<string>): string | null {
  if (!settings.enabled || !isValidTimeZone(settings.timezone)) return null;
  const local = localDateTime(now, settings.timezone);
  if (local.time < settings.remind_at.slice(0, 5)) return null;
  if (settings.last_reminded_on === local.date) return null;
  if (loggedDates.has(local.date)) return null;
  return local.date;
}
