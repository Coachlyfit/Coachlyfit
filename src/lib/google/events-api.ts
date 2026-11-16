import { GoogleApiError, readGoogleError } from "./errors";

type Fetch = typeof fetch;
const BASE = "https://www.googleapis.com/calendar/v3";

export type GoogleEvent = {
  id: string;
  summary: string;
  location?: string;
  description?: string;
  status: "confirmed" | "tentative";
  start: { dateTime: string };
  end: { dateTime: string };
  extendedProperties?: { private: Record<string, string> };
};

/** The three event operations the sync needs, on one calendar. An interface so
 * the sync logic is tested against a fake, not the network. */
export interface EventsApi {
  insert(event: GoogleEvent): Promise<{ id: string; etag: string }>;
  patch(id: string, event: Partial<GoogleEvent>): Promise<{ id: string; etag: string }>;
  remove(id: string): Promise<void>;
}

async function call<T>(fetchImpl: Fetch, accessToken: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) throw await readGoogleError(response);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export function createEventsApi(accessToken: string, calendarId: string, fetchImpl: Fetch = fetch): EventsApi {
  const events = `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
  return {
    insert: (event) => call(fetchImpl, accessToken, events, { method: "POST", body: JSON.stringify(event) }),
    patch: (id, event) =>
      call(fetchImpl, accessToken, `${events}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(event) }),
    remove: (id) => call(fetchImpl, accessToken, `${events}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}

/** A secondary calendar the app owns. calendar.app.created lets us create and
 * manage exactly these, nothing else in the account. */
export async function createCalendar(
  accessToken: string,
  args: { summary: string; timeZone: string },
  fetchImpl: Fetch = fetch
): Promise<string> {
  const created = await call<{ id: string }>(fetchImpl, accessToken, `${BASE}/calendars`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  return created.id;
}

export async function deleteCalendar(accessToken: string, calendarId: string, fetchImpl: Fetch = fetch): Promise<void> {
  try {
    await call(fetchImpl, accessToken, `${BASE}/calendars/${encodeURIComponent(calendarId)}`, { method: "DELETE" });
  } catch (error) {
    if (!(error instanceof GoogleApiError && (error.status === 404 || error.status === 410))) throw error;
  }
}
