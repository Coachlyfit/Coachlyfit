import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxPayload, OutboxRow } from "./outbox-logic";

// The IndexedDB layer (Dexie) is swapped for a small in-memory table with the
// slice of its API the engine uses, so the REAL outbox.ts and sync.ts run: the
// coalescing transaction, the retry/backoff bookkeeping, the stop rules.
const h = vi.hoisted(() => {
  type Row = Record<string, unknown> & { seq?: number };
  const rows: Row[] = [];
  let nextSeq = 1;
  const matching = (field: string, value: unknown) => rows.filter((r) => r[field] === value);

  const outbox = {
    toArray: async () => rows.map((r) => ({ ...r })),
    update: async (seq: number, patch: Row) => {
      const row = rows.find((r) => r.seq === seq);
      if (row) Object.assign(row, patch);
    },
    delete: async (seq: number) => {
      const i = rows.findIndex((r) => r.seq === seq);
      if (i >= 0) rows.splice(i, 1);
    },
    bulkDelete: async (seqs: number[]) => {
      for (const seq of seqs) await outbox.delete(seq);
    },
    put: async (row: Row) => {
      if (row.seq == null) row.seq = nextSeq++;
      const i = rows.findIndex((r) => r.seq === row.seq);
      if (i >= 0) rows[i] = { ...row };
      else rows.push({ ...row });
    },
    where: (field: string) => ({
      equals: (value: unknown) => ({
        toArray: async () => matching(field, value).map((r) => ({ ...r })),
        modify: async (patch: Row) => {
          for (const r of matching(field, value)) Object.assign(r, patch);
        },
        delete: async () => {
          for (const r of matching(field, value)) await outbox.delete(r.seq!);
        },
      }),
    }),
  };

  return {
    rows,
    reset: () => {
      rows.length = 0;
      nextSeq = 1;
    },
    db: { outbox, transaction: async (_mode: string, _table: unknown, fn: () => Promise<void>) => fn() },
    state: { dbAvailable: true },
    syncAction: vi.fn(),
    getUser: vi.fn(),
  };
});

vi.mock("./db", () => ({ getDb: async () => (h.state.dbAvailable ? h.db : null) }));
vi.mock("@/domain/workouts/workouts-actions", () => ({ syncOutboxOpAction: h.syncAction }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getUser: h.getUser } }) }));

import { discardFailed, enqueue, resetStuckRows, retryFailed } from "./outbox";
import { getSyncState, submitOp, syncNow } from "./sync";
import { MAX_ATTEMPTS } from "./outbox-logic";

const S = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const upsert = (set_index: number, over: Record<string, unknown> = {}): OutboxPayload => ({
  kind: "set_upsert",
  sessionId: S,
  input: { id: `set-${set_index}`, client_logged_at: "2026-11-14T10:00:00.000Z", program_item_id: ITEM, set_index, weight: 50, reps: 8, ...over },
});
const stored = () => h.rows as unknown as OutboxRow[];
const OK = { ok: true } as const;

beforeEach(() => {
  h.reset();
  h.state.dbAvailable = true;
  h.syncAction.mockReset();
  h.getUser.mockReset();
  h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

describe("submitOp -> syncNow (the happy path)", () => {
  it("saves locally first, sends the op, and removes the row only once the server confirmed", async () => {
    h.syncAction.mockImplementation(async () => {
      // while the request is in flight the row is still on the device
      expect(stored()).toHaveLength(1);
      expect(stored()[0].status).toBe("syncing");
      return OK;
    });
    const result = await submitOp(upsert(1));
    expect(result).toEqual({ status: "queued" });
    await vi.waitFor(() => expect(stored()).toHaveLength(0));
    expect(h.syncAction).toHaveBeenCalledTimes(1);
    expect(h.syncAction.mock.calls[0][0]).toMatchObject({ kind: "set_upsert", sessionId: S });
    expect(getSyncState().lastSyncedAt).not.toBeNull();
  });

  it("sends queued ops oldest first", async () => {
    h.syncAction.mockResolvedValue(OK);
    await enqueue(upsert(1));
    await enqueue(upsert(2));
    await enqueue({ kind: "session_complete", sessionId: S, durationSeconds: 600 });
    await syncNow();
    expect(h.syncAction.mock.calls.map((c) => (c[0] as OutboxPayload).kind)).toEqual(["set_upsert", "set_upsert", "session_complete"]);
    expect(stored()).toHaveLength(0);
  });
});

describe("failure handling", () => {
  it("a server fault counts as an attempt and backs off, keeping the row", async () => {
    h.syncAction.mockRejectedValue(new Error("boom"));
    await enqueue(upsert(1));
    const before = Date.now();
    await syncNow();
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ status: "pending", attempts: 1, lastError: "server_error" });
    expect(stored()[0].nextAttemptAt).toBeGreaterThan(before);
  });

  it("a network failure (TypeError) is not an attempt: the row stays due and the app goes offline", async () => {
    h.syncAction.mockRejectedValue(new TypeError("Failed to fetch"));
    await enqueue(upsert(1));
    await syncNow();
    expect(stored()[0]).toMatchObject({ status: "pending", attempts: 0, nextAttemptAt: 0, lastError: "offline" });
    expect(getSyncState().online).toBe(false);
  });

  it("a permanent error (e.g. a set past its 7-day lock) fails the row without retrying", async () => {
    h.syncAction.mockResolvedValue({ error: "entry_locked" });
    await enqueue(upsert(1));
    await syncNow();
    expect(stored()[0]).toMatchObject({ status: "failed", attempts: 1, lastError: "entry_locked" });
    await syncNow(); // a failed row is never picked up again
    expect(h.syncAction).toHaveBeenCalledTimes(1);
  });

  it("an unauthenticated answer stops the run and keeps every row untouched", async () => {
    h.syncAction.mockResolvedValue({ error: "unauthenticated" });
    await enqueue(upsert(1));
    await enqueue(upsert(2));
    await syncNow();
    expect(h.syncAction).toHaveBeenCalledTimes(1); // the second row was never tried
    expect(stored().map((r) => [r.status, r.attempts])).toEqual([
      ["pending", 0],
      ["pending", 0],
    ]);
  });

  it("gives up after MAX_ATTEMPTS failures", async () => {
    h.syncAction.mockRejectedValue(new Error("boom"));
    await enqueue(upsert(1));
    stored()[0].attempts = MAX_ATTEMPTS - 1;
    await syncNow();
    expect(stored()[0]).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
  });

  it("a row that is backing off blocks the newer rows of its session (a delete must not overtake an upsert)", async () => {
    await enqueue(upsert(1));
    stored()[0].nextAttemptAt = Date.now() + 60_000;
    await enqueue({ kind: "set_delete", sessionId: S, programItemId: ITEM, setIndex: 5 });
    await syncNow();
    expect(h.syncAction).not.toHaveBeenCalled();
  });

  it("does nothing, and touches no row, while the session cannot be confirmed", async () => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: null });
    h.syncAction.mockResolvedValue(OK);
    await enqueue(upsert(1));
    await syncNow();
    expect(h.syncAction).not.toHaveBeenCalled();
    expect(stored()).toHaveLength(1);
  });
});

describe("the outbox store", () => {
  it("coalesces edits of a still-queued set into one row, keeping its queue position and creation time", async () => {
    await enqueue(upsert(1, { weight: 50 }));
    await enqueue({ kind: "set_upsert", sessionId: S, input: { id: "set-1", program_item_id: ITEM, set_index: 1, weight: 55 } });
    expect(stored()).toHaveLength(1);
    expect((stored()[0].op as { input: { weight: number; client_logged_at?: string } }).input).toMatchObject({
      weight: 55,
      client_logged_at: "2026-11-14T10:00:00.000Z",
    });
  });

  it("deleting a set that never left the device cancels both", async () => {
    await enqueue(upsert(1));
    await enqueue({ kind: "set_delete", sessionId: S, programItemId: ITEM, setIndex: 1 });
    expect(stored()).toHaveLength(0);
  });

  it("resetStuckRows frees rows a closed tab left 'syncing'", async () => {
    await enqueue(upsert(1));
    stored()[0].status = "syncing";
    await resetStuckRows();
    expect(stored()[0]).toMatchObject({ status: "pending", nextAttemptAt: 0 });
  });

  it("retryFailed gives failed rows a clean slate; discardFailed removes only them", async () => {
    await enqueue(upsert(1));
    await enqueue(upsert(2));
    Object.assign(stored()[0], { status: "failed", attempts: 6, lastError: "entry_locked" });
    await retryFailed();
    expect(stored()[0]).toMatchObject({ status: "pending", attempts: 0, lastError: null, nextAttemptAt: 0 });

    Object.assign(stored()[0], { status: "failed" });
    await discardFailed();
    expect(stored().map((r) => (r.op as { input: { set_index: number } }).input.set_index)).toEqual([2]);
  });
});

describe("without a usable IndexedDB", () => {
  it("submitOp falls back to a direct online send and reports the outcome", async () => {
    h.state.dbAvailable = false;
    h.syncAction.mockResolvedValueOnce(OK).mockResolvedValueOnce({ error: "not_found_or_forbidden" }).mockRejectedValueOnce(new Error("down"));
    expect(await submitOp(upsert(1))).toEqual({ status: "done" });
    expect(await submitOp(upsert(2))).toEqual({ status: "error", error: "not_found_or_forbidden" });
    expect(await submitOp(upsert(3))).toEqual({ status: "error", error: "network" });
    expect(await enqueue(upsert(4))).toBe(false);
    expect(getSyncState().storage).toBe("unavailable");
  });
});
