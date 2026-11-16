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

/** An event as Google returns it. Only the fields the pull side reads. */
export type RemoteEvent = {
  id: string;
  etag?: string;
  /** "cancelled" for a deleted event in an incremental listing. */
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

export type EventsPage = { items: RemoteEvent[]; nextPageToken?: string; nextSyncToken?: string };

/** One page of a calendar's events. With a `syncToken` Google returns only what
 * changed since (deleted events included); an expired token is a 410
 * ("fullSyncRequired"), which the caller answers with a full resync. */
export async function listEvents(
  accessToken: string,
  calendarId: string,
  opts: { syncToken?: string | null; pageToken?: string },
  fetchImpl: Fetch = fetch
): Promise<EventsPage> {
  const params = new URLSearchParams({ maxResults: "250" });
  if (opts.syncToken) params.set("syncToken", opts.syncToken);
  if (opts.pageToken) params.set("pageToken", opts.pageToken);
  return call<EventsPage>(fetchImpl, accessToken, `${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
}

/** Ask Google to POST to `address` whenever the calendar changes. `address`
 * must be https; Google caps the lifetime (about a week). */
export async function watchEvents(
  accessToken: string,
  calendarId: string,
  channel: { id: string; token: string; address: string; expiration: number },
  fetchImpl: Fetch = fetch
): Promise<{ resourceId: string; expiration: string }> {
  return call(fetchImpl, accessToken, `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
    method: "POST",
    body: JSON.stringify({ id: channel.id, type: "web_hook", address: channel.address, token: channel.token, expiration: channel.expiration }),
  });
}

/** Best effort at the call sites: an already-expired channel answers 404. */
export async function stopChannel(
  accessToken: string,
  channel: { id: string; resourceId: string },
  fetchImpl: Fetch = fetch
): Promise<void> {
  try {
    await call(fetchImpl, accessToken, `${BASE}/channels/stop`, {
      method: "POST",
      body: JSON.stringify({ id: channel.id, resourceId: channel.resourceId }),
    });
  } catch (error) {
    if (!(error instanceof GoogleApiError && error.status === 404)) throw error;
  }
}

/** Busy intervals of the coach's primary calendar. calendar.freebusy can only
 * answer for calendars it is given by id, and without a calendar-list scope
 * that means "primary" (their other calendars can't be enumerated). */
export async function queryFreeBusy(
  accessToken: string,
  range: { timeMin: string; timeMax: string },
  fetchImpl: Fetch = fetch
): Promise<{ start: string; end: string }[]> {
  const body = await call<{
    calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: { reason?: string }[] }>;
  }>(fetchImpl, accessToken, `${BASE}/freeBusy`, {
    method: "POST",
    body: JSON.stringify({ ...range, items: [{ id: "primary" }] }),
  });
  const primary = body.calendars?.primary;
  // Per-calendar failures come back inside a 200.
  if (primary?.errors?.length) throw new GoogleApiError(403, primary.errors[0].reason ?? "freebusy_error");
  return primary?.busy ?? [];
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
