/** Days a soft-deleted client stays restorable. Must match the interval in
 * private.purge_deleted_clients() (20261120000001_client_soft_delete.sql). */
export const CLIENT_DELETE_RETENTION_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days left before permanent deletion, never negative. A client
 * deleted just now has the full 60; one 59.5 days old still has 1. */
export function daysUntilPermanentDelete(deletedAt: string, now: Date = new Date()): number {
  const elapsed = now.getTime() - new Date(deletedAt).getTime();
  return Math.max(0, Math.ceil(CLIENT_DELETE_RETENTION_DAYS - elapsed / DAY_MS));
}
