import { describe, expect, it } from "vitest";
import { GoogleApiError } from "@/lib/google/errors";
import { GoogleWatchService } from "./watch.service";

const NOW = new Date("2026-01-18T10:00:00Z");
const HOUR = 3_600_000;
const access = async () => ({ accessToken: "at", calendarId: "cal" });

type Write = { table: string; op: string; payload?: unknown };

function fakeDb(connections: unknown[], reconnectFlips = false) {
  const writes: Write[] = [];
  const builder = (table: string, op: string, payload?: unknown) => {
    if (op !== "select") writes.push({ table, op, payload });
    const result = () =>
      table === "google_connections" && op === "select"
        ? { data: connections, error: null }
        : table === "google_connections" && op === "update"
          ? { data: reconnectFlips ? [{ id: "c" }] : [], error: null }
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
      upsert: (payload: unknown) => builder(table, "upsert", payload),
    }),
  };
  return { db: db as never, writes };
}

function fakeGoogle() {
  const watched: { calendar: string; channel: { id: string; token: string; address: string; expiration: number } }[] = [];
  const stopped: { id: string; resourceId: string }[] = [];
  return {
    watched,
    stopped,
    deps: {
      watch: async (_token: string, calendar: string, channel: { id: string; token: string; address: string; expiration: number }) => {
        watched.push({ calendar, channel });
        return { resourceId: "res-new", expiration: String(NOW.getTime() + 7 * 24 * HOUR) };
      },
      stop: async (_token: string, channel: { id: string; resourceId: string }) => {
        stopped.push(channel);
      },
    },
  };
}

const channel = (expiresInHours: number) => ({
  channel_id: "old-ch",
  resource_id: "old-res",
  expires_at: new Date(NOW.getTime() + expiresInHours * HOUR).toISOString(),
  sync_token: "tok",
});
const connection = (channels: unknown) => ({ id: "conn-1", coach_id: "coach-1", google_watch_channels: channels });

const service = (fake: ReturnType<typeof fakeDb>, google: ReturnType<typeof fakeGoogle>, origin = "https://app.test", accessFor = access) =>
  new GoogleWatchService(fake.db, accessFor, origin, () => NOW, google.deps);

describe("GoogleWatchService.ensure", () => {
  it("registers a channel for a new connection, pointing at the webhook, starting dirty with no sync token", async () => {
    const fake = fakeDb([connection(null)]);
    const google = fakeGoogle();
    expect(await service(fake, google).ensure()).toEqual({ created: 1, renewed: 0, failed: 0, skipped: false });

    const { channel: sent } = google.watched[0];
    expect(sent.address).toBe("https://app.test/api/google/webhook");
    expect(sent.token.length).toBeGreaterThanOrEqual(43);
    expect(sent.expiration).toBe(NOW.getTime() + 7 * 24 * HOUR);
    expect(fake.writes.find((w) => w.op === "upsert")?.payload).toMatchObject({
      connection_id: "conn-1",
      channel_id: sent.id,
      resource_id: "res-new",
      channel_token: sent.token,
      sync_token: null,
      dirty_at: NOW.toISOString(),
    });
    expect(google.stopped).toEqual([]);
  });

  it("renews a channel that expires within two days: keeps the sync token and stops the old channel", async () => {
    const fake = fakeDb([connection(channel(24))]);
    const google = fakeGoogle();
    expect(await service(fake, google).ensure()).toMatchObject({ created: 0, renewed: 1 });

    expect(fake.writes.find((w) => w.op === "upsert")?.payload).toMatchObject({ sync_token: "tok" });
    expect(google.stopped).toEqual([{ id: "old-ch", resourceId: "old-res" }]);
  });

  it("leaves a healthy channel alone (also when the relation comes back as an array)", async () => {
    for (const shape of [channel(100), [channel(100)]]) {
      const fake = fakeDb([connection(shape)]);
      const google = fakeGoogle();
      expect(await service(fake, google).ensure()).toMatchObject({ created: 0, renewed: 0 });
      expect(google.watched).toEqual([]);
    }
  });

  it("skips entirely without an https origin (Google only delivers to https)", async () => {
    const google = fakeGoogle();
    expect(await service(fakeDb([connection(null)]), google, "http://localhost:3000").ensure()).toMatchObject({ skipped: true });
    expect(google.watched).toEqual([]);
  });

  it("counts a failure, keeps going, and flags a dead grant", async () => {
    const fake = fakeDb([connection(null)], true);
    const counts = await service(fake, fakeGoogle(), "https://app.test", async () => {
      throw new GoogleApiError(400, "invalid_grant");
    }).ensure();
    expect(counts).toMatchObject({ failed: 1, created: 0 });
    expect(fake.writes).toContainEqual({ table: "google_connections", op: "update", payload: { status: "needs_reconnect" } });
  });
});
