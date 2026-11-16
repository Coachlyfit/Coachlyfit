import { describe, expect, it } from "vitest";
import { GoogleApiError } from "@/lib/google/errors";
import type { EventsPage, RemoteEvent } from "@/lib/google/events-api";
import { GooglePullService, REMOVED_IN_GOOGLE } from "./pull.service";

const NOW = new Date("2026-01-18T10:00:00Z");
const A = "7f9c2e3a-1b4d-4c5e-8a6f-0123456789ab";
const DIRTY = "2026-01-18T09:59:00+00:00";

const channel = (syncToken: string | null) => ({
  id: "ch1",
  sync_token: syncToken,
  dirty_at: DIRTY,
  google_connections: { coach_id: "coach-1", status: "active" },
});
const row = {
  id: A,
  coach_id: "coach-1",
  status: "confirmed",
  starts_at: "2026-01-19T07:00:00Z",
  ends_at: "2026-01-19T08:00:00Z",
  google_event_id: "ev1",
  google_etag: '"1"',
};
const detail = {
  id: A,
  starts_at: "2026-01-19T07:00:00Z",
  type: "online",
  client: { display_name: "Sara", profile_id: "client-p", assigned_to: null },
  coach: { business_name: "Coach Co" },
};
const movedEvent: RemoteEvent = {
  id: "ev1",
  etag: '"2"',
  status: "confirmed",
  start: { dateTime: "2026-01-19T09:00:00Z" },
  end: { dateTime: "2026-01-19T10:00:00Z" },
  extendedProperties: { private: { coachlyAppointmentId: A } },
};

type Write = { table: string; op: string; payload?: unknown };

/** `script` holds the answers for reads, in the order they are awaited. Writes
 * are recorded; an update answers with one matched row unless scripted. */
function fakeDb(script: Record<string, unknown[]>) {
  const writes: Write[] = [];
  const next = (key: string, fallback: unknown) => (script[key]?.length ? script[key].shift() : fallback);
  const builder = (table: string, op: string, payload?: unknown) => {
    if (op !== "select") writes.push({ table, op, payload });
    const result = () =>
      op === "select"
        ? next(`${table}.select`, { data: [], error: null })
        : op === "update"
          ? next(`${table}.update`, { data: [{ id: "row" }], error: null })
          : { data: null, error: null };
    const chain: unknown = new Proxy(
      {},
      { get: (_t, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve(result()) : () => chain) }
    );
    return chain;
  };
  const db = {
    from: (table: string) => ({
      select: () => builder(table, "select"),
      update: (payload: unknown) => builder(table, "update", payload),
      insert: (payload: unknown) => builder(table, "insert", payload),
    }),
  };
  return { db: db as never, writes };
}

const access = async () => ({ accessToken: "at", calendarId: "cal" });
const ok = (data: unknown) => ({ data, error: null });
const page = (items: RemoteEvent[], nextSyncToken = "tok-new"): EventsPage => ({ items, nextSyncToken });

const updates = (writes: Write[], table: string) => writes.filter((w) => w.table === table && w.op === "update").map((w) => w.payload);
const inserts = (writes: Write[], table: string) => writes.filter((w) => w.table === table && w.op === "insert").map((w) => w.payload);

describe("GooglePullService", () => {
  it("turns a move in Google into a reschedule request with the proposed time, and tells the client", async () => {
    const fake = fakeDb({
      "google_watch_channels.select": [ok([channel("tok-old")])],
      "appointments.select": [ok([row]), ok([detail])],
    });
    const calls: unknown[] = [];
    const service = new GooglePullService(fake.db, access, () => NOW, async (_t, _c, opts) => {
      calls.push(opts);
      return page([movedEvent]);
    });

    const counts = await service.run();

    expect(counts).toMatchObject({ channels: 1, moved: 1, deleted: 0, failed: 0 });
    expect(calls).toEqual([{ syncToken: "tok-old", pageToken: undefined }]);
    expect(updates(fake.writes, "appointments")).toEqual([
      {
        reschedule_requested_at: NOW.toISOString(),
        proposed_starts_at: "2026-01-19T09:00:00Z",
        proposed_ends_at: "2026-01-19T10:00:00Z",
      },
    ]);
    expect(inserts(fake.writes, "notifications")).toEqual([
      {
        profile_id: "client-p",
        kind: "appointment_reschedule_proposed",
        payload: { appointment_id: A, type: "online", starts_at: "2026-01-19T09:00:00Z", name: "Coach Co", audience: "client" },
      },
    ]);
    // New token saved, dirty flag cleared (only if no newer webhook arrived).
    expect(updates(fake.writes, "google_watch_channels")).toEqual([{ sync_token: "tok-new" }, { dirty_at: null }]);
  });

  it("cancels an appointment whose event was deleted in Google and tells the coach (the trigger tells the client)", async () => {
    const fake = fakeDb({
      "google_watch_channels.select": [ok([channel("tok-old")])],
      "appointments.select": [ok([row]), ok([detail])],
    });
    const deleted: RemoteEvent = { id: "ev1", etag: '"9"', status: "cancelled", extendedProperties: movedEvent.extendedProperties };
    const counts = await new GooglePullService(fake.db, access, () => NOW, async () => page([deleted])).run();

    expect(counts).toMatchObject({ deleted: 1, moved: 0 });
    expect(updates(fake.writes, "appointments")).toEqual([{ status: "cancelled", cancel_reason: REMOVED_IN_GOOGLE }]);
    expect(inserts(fake.writes, "notifications")).toEqual([
      [
        {
          profile_id: "coach-1",
          kind: "appointment_cancelled",
          payload: { appointment_id: A, type: "online", starts_at: detail.starts_at, name: "Sara", audience: "coach" },
        },
      ],
    ]);
  });

  it("does nothing twice: a change another run already applied sends no notification", async () => {
    const fake = fakeDb({
      "google_watch_channels.select": [ok([channel("tok-old")])],
      "appointments.select": [ok([row]), ok([detail])],
      // The conditional UPDATE matched no row: someone got there first.
      "appointments.update": [ok([])],
    });
    const counts = await new GooglePullService(fake.db, access, () => NOW, async () => page([movedEvent])).run();
    expect(counts.moved).toBe(0);
    expect(inserts(fake.writes, "notifications")).toEqual([]);
  });

  describe("sync token expired (410)", () => {
    it("forgets the token, lists everything again, and finds what disappeared", async () => {
      // The full listing has no event for ev1: it was deleted while we weren't looking.
      const fake = fakeDb({
        "google_watch_channels.select": [ok([channel("tok-expired")])],
        "appointments.select": [ok([row]), ok([detail])],
      });
      const calls: { syncToken?: string | null }[] = [];
      const list = async (_t: string, _c: string, opts: { syncToken?: string | null }): Promise<EventsPage> => {
        calls.push(opts);
        if (opts.syncToken) throw new GoogleApiError(410, "fullSyncRequired");
        return page([], "tok-fresh");
      };

      const counts = await new GooglePullService(fake.db, access, () => NOW, list).run();

      expect(calls.map((c) => c.syncToken)).toEqual(["tok-expired", null]);
      expect(counts).toMatchObject({ resynced: 1, deleted: 1, failed: 0 });
      expect(updates(fake.writes, "appointments")).toEqual([{ status: "cancelled", cancel_reason: REMOVED_IN_GOOGLE }]);
      expect(updates(fake.writes, "google_watch_channels")[0]).toEqual({ sync_token: "tok-fresh" });
    });

    it("pages through a long full listing", async () => {
      const fake = fakeDb({
        "google_watch_channels.select": [ok([channel("tok-expired")])],
        "appointments.select": [ok([row])],
      });
      const present: RemoteEvent = { ...movedEvent, etag: '"1"', start: { dateTime: row.starts_at }, end: { dateTime: row.ends_at } };
      let n = 0;
      const list = async (_t: string, _c: string, opts: { syncToken?: string | null; pageToken?: string }): Promise<EventsPage> => {
        if (opts.syncToken) throw new GoogleApiError(410, "fullSyncRequired");
        return n++ === 0 ? { items: [], nextPageToken: "p2" } : page([present], "tok-fresh");
      };
      const counts = await new GooglePullService(fake.db, access, () => NOW, list).run();
      // ev1 is on the second page: not missing, so nothing is cancelled.
      expect(counts).toMatchObject({ resynced: 1, deleted: 0, failed: 0 });
    });
  });

  it("only records the token on the first pass over a new channel (nothing to compare yet)", async () => {
    const fake = fakeDb({ "google_watch_channels.select": [ok([channel(null)])] });
    const counts = await new GooglePullService(fake.db, access, () => NOW, async () => page([movedEvent], "tok-first")).run();

    expect(counts).toMatchObject({ channels: 1, moved: 0, deleted: 0 });
    expect(updates(fake.writes, "appointments")).toEqual([]);
    expect(updates(fake.writes, "google_watch_channels")[0]).toEqual({ sync_token: "tok-first" });
  });

  it("leaves the channel dirty to retry when Google fails, and flags a dead grant", async () => {
    const fake = fakeDb({ "google_watch_channels.select": [ok([channel("tok-old")])] });
    const counts = await new GooglePullService(fake.db, access, () => NOW, async () => {
      throw new GoogleApiError(503, "backendError");
    }).run();
    expect(counts).toMatchObject({ channels: 0, failed: 1 });
    expect(updates(fake.writes, "google_watch_channels")).toEqual([]);

    const dead = fakeDb({ "google_watch_channels.select": [ok([channel("tok-old")])], "google_connections.update": [ok([{ id: "c" }])] });
    await new GooglePullService(dead.db, async () => {
      throw new GoogleApiError(400, "invalid_grant");
    }, () => NOW).run();
    expect(updates(dead.writes, "google_connections")).toEqual([{ status: "needs_reconnect" }]);
    expect(inserts(dead.writes, "notifications")).toEqual([{ profile_id: "coach-1", kind: "google_reconnect_needed", payload: {} }]);
  });
});
