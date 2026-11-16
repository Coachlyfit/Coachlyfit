import { describe, expect, it } from "vitest";
import { GoogleApiError } from "@/lib/google/errors";
import type { EventsApi } from "@/lib/google/events-api";
import { GoogleSyncService } from "./sync.service";

const NOW = new Date("2026-01-18T10:00:00Z");
const APPOINTMENT = {
  id: "7f9c2e3a-1b4d-4c5e-8a6f-0123456789ab",
  status: "confirmed",
  starts_at: "2026-01-19T07:00:00Z",
  ends_at: "2026-01-19T08:00:00Z",
  type: "online",
  location_or_link: null,
  google_event_id: null,
  client: { display_name: "Sara" },
};

const job = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  coach_id: "coach-1",
  appointment_id: APPOINTMENT.id,
  status: "processing",
  attempts: 0,
  next_attempt_at: NOW.toISOString(),
  locked_at: NOW.toISOString(),
  last_error: null,
  created_at: NOW.toISOString(),
  ...over,
});

type Call = { table: string; op: string; payload?: unknown };

/** Records every write and answers reads with canned rows. No mocking library. */
function fakeDb(opts: { jobs: ReturnType<typeof job>[]; appointment?: typeof APPOINTMENT | null; flippedConnection?: boolean }) {
  const calls: Call[] = [];
  const builder = (table: string, op: string, payload?: unknown) => {
    calls.push({ table, op, payload });
    const result = () => {
      if (table === "appointments" && op === "select") return { data: opts.appointment === undefined ? APPOINTMENT : opts.appointment, error: null };
      if (table === "profiles") return { data: { locale: "en" }, error: null };
      if (table === "google_connections" && op === "update") return { data: opts.flippedConnection ? [{ id: "conn-1" }] : [], error: null };
      return { data: null, error: null };
    };
    const chain: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result());
          if (prop === "maybeSingle" || prop === "single") return async () => result();
          return () => chain;
        },
      }
    );
    return chain;
  };
  const db = {
    rpc: async () => ({ data: opts.jobs, error: null }),
    from: (table: string) => ({
      select: () => builder(table, "select"),
      update: (payload: unknown) => builder(table, "update", payload),
      insert: (payload: unknown) => builder(table, "insert", payload),
      delete: () => builder(table, "delete"),
    }),
  };
  return { db: db as never, calls };
}

const writes = (calls: Call[], table: string, op: string) => calls.filter((c) => c.table === table && c.op === op).map((c) => c.payload);

function okApi(): EventsApi & { inserted: string[] } {
  const inserted: string[] = [];
  return {
    inserted,
    insert: async (event) => {
      inserted.push(event.id);
      return { id: event.id, etag: '"1"' };
    },
    patch: async (id) => ({ id, etag: '"2"' }),
    remove: async () => undefined,
  };
}

const run = (fake: ReturnType<typeof fakeDb>, apiFor: (coachId: string) => Promise<EventsApi>) =>
  new GoogleSyncService(fake.db, apiFor, () => NOW, () => 0).run();

describe("GoogleSyncService.run", () => {
  it("creates the event, saves its id on the appointment and finishes the job", async () => {
    const api = okApi();
    const fake = fakeDb({ jobs: [job("j1")] });
    const counts = await run(fake, async () => api);

    expect(counts).toEqual({ done: 1, retried: 0, dead: 0, paused: 0 });
    expect(api.inserted).toEqual(["7f9c2e3a1b4d4c5e8a6f0123456789ab"]);
    expect(writes(fake.calls, "appointments", "update")).toEqual([
      { google_event_id: "7f9c2e3a1b4d4c5e8a6f0123456789ab", google_etag: '"1"', last_synced_at: NOW.toISOString() },
    ]);
    expect(writes(fake.calls, "google_sync_jobs", "update")).toContainEqual({ status: "done", locked_at: null, last_error: null });
    expect(writes(fake.calls, "google_connections", "update")).toContainEqual({ last_sync_at: NOW.toISOString() });
  });

  it("asks Google for one access token per coach, not per job", async () => {
    let tokens = 0;
    const fake = fakeDb({ jobs: [job("j1"), job("j2")] });
    await run(fake, async () => {
      tokens++;
      return okApi();
    });
    expect(tokens).toBe(1);
  });

  it("backs off on a rate limit: back to pending, attempt counted, never sooner than Retry-After", async () => {
    const api: EventsApi = {
      ...okApi(),
      insert: async () => {
        throw new GoogleApiError(429, "rateLimitExceeded", 10 * 60_000);
      },
    };
    const fake = fakeDb({ jobs: [job("j1")] });
    const counts = await run(fake, async () => api);

    expect(counts).toEqual({ done: 0, retried: 1, dead: 0, paused: 0 });
    expect(writes(fake.calls, "google_sync_jobs", "update")[0]).toEqual({
      status: "pending",
      locked_at: null,
      attempts: 1,
      last_error: "Google API error 429 rateLimitExceeded",
      next_attempt_at: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
    });
    expect(writes(fake.calls, "appointments", "update")).toEqual([]);
  });

  it("marks a permanently refused job dead", async () => {
    const api: EventsApi = {
      ...okApi(),
      insert: async () => {
        throw new GoogleApiError(400, "invalid");
      },
    };
    const fake = fakeDb({ jobs: [job("j1")] });
    expect(await run(fake, async () => api)).toMatchObject({ dead: 1 });
    expect(writes(fake.calls, "google_sync_jobs", "update")[0]).toMatchObject({ status: "dead", attempts: 1 });
  });

  it("on invalid_grant: flags the connection once, tells the coach once, keeps every job for later", async () => {
    const fake = fakeDb({ jobs: [job("j1"), job("j2", { appointment_id: "other" })], flippedConnection: true });
    const counts = await run(fake, async () => {
      throw new GoogleApiError(400, "invalid_grant");
    });

    expect(counts).toEqual({ done: 0, retried: 0, dead: 0, paused: 2 });
    expect(writes(fake.calls, "google_connections", "update")).toContainEqual({ status: "needs_reconnect" });
    expect(writes(fake.calls, "notifications", "insert")).toEqual([
      { profile_id: "coach-1", kind: "google_reconnect_needed", payload: {} },
    ]);
    // Both jobs go back to pending without burning an attempt.
    expect(writes(fake.calls, "google_sync_jobs", "update")).toEqual([
      { status: "pending", locked_at: null, attempts: 0 },
      { status: "pending", locked_at: null, attempts: 0 },
    ]);
  });

  it("doesn't notify again when the connection was already flagged", async () => {
    const fake = fakeDb({ jobs: [job("j1")], flippedConnection: false });
    await run(fake, async () => {
      throw new GoogleApiError(400, "invalid_grant");
    });
    expect(writes(fake.calls, "notifications", "insert")).toEqual([]);
  });

  it("treats a vanished appointment as done", async () => {
    const fake = fakeDb({ jobs: [job("j1")], appointment: null });
    expect(await run(fake, async () => okApi())).toMatchObject({ done: 1 });
    expect(writes(fake.calls, "appointments", "update")).toEqual([]);
  });
});
