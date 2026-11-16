import { describe, expect, it } from "vitest";
import { GoogleApiError } from "./errors";
import { listEvents, queryFreeBusy, stopChannel, watchEvents } from "./events-api";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fetch that records the request and answers with the given response. */
function fixture(response: Response) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return response;
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}

describe("listEvents", () => {
  it("sends the sync token and page token, with the access token as a bearer", async () => {
    const { fetchImpl, requests } = fixture(json({ items: [{ id: "e1" }], nextSyncToken: "next" }));
    const page = await listEvents("at", "cal@group", { syncToken: "tok", pageToken: "p2" }, fetchImpl);

    expect(page).toEqual({ items: [{ id: "e1" }], nextSyncToken: "next" });
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/calendar/v3/calendars/cal%40group/events");
    expect(url.searchParams.get("syncToken")).toBe("tok");
    expect(url.searchParams.get("pageToken")).toBe("p2");
    expect((requests[0].init.headers as Record<string, string>).Authorization).toBe("Bearer at");
  });

  it("raises an expired sync token as a 410 the caller can recognise", async () => {
    const { fetchImpl } = fixture(json({ error: { code: 410, errors: [{ reason: "fullSyncRequired" }] } }, 410));
    const error = await listEvents("at", "cal", { syncToken: "old" }, fetchImpl).catch((e) => e);
    expect(error).toBeInstanceOf(GoogleApiError);
    expect(error).toMatchObject({ status: 410, reason: "fullSyncRequired" });
  });
});

describe("queryFreeBusy", () => {
  it("asks about the primary calendar and returns its busy intervals", async () => {
    const busy = [{ start: "2026-01-20T08:00:00Z", end: "2026-01-20T09:00:00Z" }];
    const { fetchImpl, requests } = fixture(json({ calendars: { primary: { busy } } }));
    const range = { timeMin: "2026-01-18T00:00:00Z", timeMax: "2026-03-18T00:00:00Z" };

    expect(await queryFreeBusy("at", range, fetchImpl)).toEqual(busy);
    expect(JSON.parse(requests[0].init.body as string)).toEqual({ ...range, items: [{ id: "primary" }] });
  });

  it("returns nothing for a free calendar", async () => {
    const { fetchImpl } = fixture(json({ calendars: { primary: { busy: [] } } }));
    expect(await queryFreeBusy("at", { timeMin: "a", timeMax: "b" }, fetchImpl)).toEqual([]);
  });

  it("treats a per-calendar error inside a 200 as a failure, not as 'free'", async () => {
    const { fetchImpl } = fixture(json({ calendars: { primary: { errors: [{ reason: "notFound" }] } } }));
    await expect(queryFreeBusy("at", { timeMin: "a", timeMax: "b" }, fetchImpl)).rejects.toMatchObject({ reason: "notFound" });
  });
});

describe("watchEvents / stopChannel", () => {
  it("registers a web_hook channel carrying our secret token", async () => {
    const { fetchImpl, requests } = fixture(json({ resourceId: "res", expiration: "1768000000000" }));
    const result = await watchEvents("at", "cal", { id: "ch", token: "secret", address: "https://app.test/api/google/webhook", expiration: 1768000000000 }, fetchImpl);

    expect(result).toEqual({ resourceId: "res", expiration: "1768000000000" });
    expect(requests[0].url).toBe("https://www.googleapis.com/calendar/v3/calendars/cal/events/watch");
    expect(JSON.parse(requests[0].init.body as string)).toEqual({
      id: "ch",
      type: "web_hook",
      address: "https://app.test/api/google/webhook",
      token: "secret",
      expiration: 1768000000000,
    });
  });

  it("stops a channel, and a channel that already expired (404) is fine", async () => {
    const ok = fixture(new Response(null, { status: 204 }));
    await expect(stopChannel("at", { id: "ch", resourceId: "res" }, ok.fetchImpl)).resolves.toBeUndefined();
    expect(JSON.parse(ok.requests[0].init.body as string)).toEqual({ id: "ch", resourceId: "res" });

    const gone = fixture(json({ error: { errors: [{ reason: "notFound" }] } }, 404));
    await expect(stopChannel("at", { id: "ch", resourceId: "res" }, gone.fetchImpl)).resolves.toBeUndefined();

    const broken = fixture(json({ error: { errors: [{ reason: "backendError" }] } }, 500));
    await expect(stopChannel("at", { id: "ch", resourceId: "res" }, broken.fetchImpl)).rejects.toMatchObject({ status: 500 });
  });
});
