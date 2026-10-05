import { isClientLate, lastCheckinDate } from "@/domain/progress/stats";

const DAY_MS = 24 * 60 * 60 * 1000;

// due_date / end_date / checkin_date are Postgres `date`s -- naive
// YYYY-MM-DD strings. Same UTC-normalized stepping as progress/stats.ts, for
// the same off-by-one-day reason.
function toUtc(isoDay: string): number {
  const [y, m, d] = isoDay.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function shiftDay(isoDay: string, delta: number): string {
  return new Date(toUtc(isoDay) + delta * DAY_MS).toISOString().slice(0, 10);
}

export type HomeWindow = { today: string; weekEnd: string; paymentsFrom: string };

/** The dashboard's date bounds, all inclusive. "This week" is the rolling 7
 * days starting today, not a calendar week -- a program ending tomorrow
 * matters the same on a Friday as on a Saturday. Payments also look a week
 * back, so an invoice that just went overdue stays on the list. */
export function homeWindow(now: Date): HomeWindow {
  const today = now.toISOString().slice(0, 10);
  return { today, weekEnd: shiftDay(today, 6), paymentsFrom: shiftDay(today, -7) };
}

export type PaymentStatus = "overdue" | "due" | "paid";

/** "Overdue" is not a stored invoice status (see INVOICE_STATUSES) -- it's
 * an issued invoice whose due_date has passed. Due today is still "due". */
export function invoicePaymentStatus(
  invoice: { status: string; due_date: string | null },
  today: string
): PaymentStatus {
  if (invoice.status === "paid") return "paid";
  return invoice.due_date != null && invoice.due_date < today ? "overdue" : "due";
}

export type QuietClient = { id: string; name: string; days: number | null };

/** Active clients with no check-in in LATE_AFTER_DAYS -- the same rule as
 * the roster's "late" flag (isClientLate), so the two never disagree.
 * `days` is null when there's no check-in in the rows given, which the
 * caller bounds to a lookback window. Longest silence first; those go last
 * since "never" isn't comparable to a day count. */
export function quietClients(
  clients: { id: string; display_name: string; status: string }[],
  checkins: { client_id: string; checkin_date: string }[],
  now: Date
): QuietClient[] {
  const byClient = new Map<string, { checkin_date: string }[]>();
  for (const row of checkins) {
    const bucket = byClient.get(row.client_id);
    if (bucket) bucket.push(row);
    else byClient.set(row.client_id, [row]);
  }

  const today = now.toISOString().slice(0, 10);
  const quiet: QuietClient[] = [];
  for (const client of clients) {
    const lastActive = lastCheckinDate(byClient.get(client.id) ?? []);
    if (!isClientLate(client.status as "invited" | "active" | "archived", lastActive, now)) continue;
    quiet.push({
      id: client.id,
      name: client.display_name,
      days: lastActive ? Math.round((toUtc(today) - toUtc(lastActive)) / DAY_MS) : null,
    });
  }
  return quiet.sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
}
