/** A user who hasn't been seen for this long reads as "inactive" rather than
 * merely offline. The one place this number lives. */
export const INACTIVE_AFTER_DAYS = 14;

/** Private Realtime Presence topic. Must match the realtime.messages
 * policies in supabase/migrations/20261011000003_admin_online.sql. */
export const ONLINE_TOPIC = "presence:online";

const DAY_MS = 24 * 60 * 60 * 1000;

export type PresenceStatus = "online" | "offline" | "inactive" | "never";

/** Derived, never stored. Being present wins over everything: a user on the
 * presence channel is online even if last_seen_at hasn't caught up yet (the
 * heartbeat that writes it runs once a minute). */
export function presenceStatus(present: boolean, lastSeenAt: string | null, now: Date = new Date()): PresenceStatus {
  if (present) return "online";
  if (!lastSeenAt) return "never";
  return now.getTime() - new Date(lastSeenAt).getTime() > INACTIVE_AFTER_DAYS * DAY_MS ? "inactive" : "offline";
}

/** Whole days since `lastSeenAt`, for "17 days ago" labels. */
export function daysSince(lastSeenAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(lastSeenAt).getTime()) / DAY_MS));
}
