/** Pure helpers for admin_audit_log rows, shared by the settings audit tab
 * and the coach detail page. */

// Mirrors admin_audit_log_action_check (latest: 20261012000001).
export const AUDIT_ACTIONS = [
  "profile_update",
  "email_change",
  "password_reset",
  "role_change",
  "suspend",
  "unsuspend",
  "delete",
  "invite_link_created",
  "subscription_update",
  "note",
  "request_approve",
  "request_reject",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isAuditAction(value: unknown): value is AuditAction {
  return AUDIT_ACTIONS.includes(value as AuditAction);
}

type Change = { from: unknown; to: unknown };

export function changes(details: unknown): [string, Change][] {
  if (!details || typeof details !== "object") return [];
  return Object.entries(details as Record<string, unknown>).filter(
    (e): e is [string, Change] => !!e[1] && typeof e[1] === "object" && "to" in e[1]
  );
}

/** Text of an internal note entry (action "note"), else null. */
export function noteOf(details: unknown): string | null {
  const note = (details as { note?: unknown } | null)?.note;
  return typeof note === "string" ? note : null;
}

export const show = (v: unknown) => (v == null || v === "" ? "—" : String(v));

// ponytail: one fixed zone so server render and hydration agree and "today"
// means the same thing for every admin. Make it a platform setting if the
// team ever spans time zones.
export const AUDIT_TIME_ZONE = "Africa/Cairo";

// en-CA renders as YYYY-MM-DD.
const dayKey = (value: string | Date) => new Date(value).toLocaleDateString("en-CA", { timeZone: AUDIT_TIME_ZONE });

export type DayGroup<T> = { day: string; kind: "today" | "yesterday" | "date"; items: T[] };

/** Buckets newest-first rows by calendar day (YYYY-MM-DD in AUDIT_TIME_ZONE),
 * keeping their order. */
export function groupByDay<T extends { created_at: string }>(entries: T[], now: Date = new Date()): DayGroup<T>[] {
  const today = dayKey(now);
  const yesterday = new Date(Date.parse(today + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);

  const groups: DayGroup<T>[] = [];
  for (const entry of entries) {
    const day = dayKey(entry.created_at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(entry);
    else groups.push({ day, kind: day === today ? "today" : day === yesterday ? "yesterday" : "date", items: [entry] });
  }
  return groups;
}
