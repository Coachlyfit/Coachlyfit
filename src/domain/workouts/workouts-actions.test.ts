import { beforeEach, describe, expect, it, vi } from "vitest";

// syncOutboxOpAction is the one server entry point the offline outbox replays
// into: it validates each queued op, checks the session, routes to the service,
// and maps the "set is past its 7-day lock" trigger error to a permanent
// `entry_locked`. The service and the Supabase client are replaced by recorders
// so only the action's own routing and error mapping run.
const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  logSet: vi.fn(),
  deleteSetByKey: vi.fn(),
  setExerciseResult: vi.fn(),
  saveBlockResult: vi.fn(),
  completeSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock("./workouts.service", () => ({
  WorkoutsService: class {
    logSet = h.logSet;
    deleteSetByKey = h.deleteSetByKey;
    setExerciseResult = h.setExerciseResult;
    saveBlockResult = h.saveBlockResult;
    completeSession = h.completeSession;
  },
}));
vi.mock("./activity-logs.service", () => ({ ActivityLogsService: class {} }));

import { syncOutboxOpAction, type OutboxOpInput } from "./workouts-actions";

const SESSION = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";

const setUpsert = (over: Record<string, unknown> = {}): OutboxOpInput => ({
  kind: "set_upsert",
  sessionId: SESSION,
  input: { id: "33333333-3333-4333-8333-333333333333", program_item_id: ITEM, set_index: 1, weight: 50, reps: 8, ...over },
});

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset();
  h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  h.logSet.mockResolvedValue({ id: "row" });
  h.setExerciseResult.mockResolvedValue({ id: "row" });
  h.saveBlockResult.mockResolvedValue(true);
  h.completeSession.mockResolvedValue(true);
});

describe("syncOutboxOpAction: gatekeeping", () => {
  it("rejects a malformed op before touching anything", async () => {
    expect(await syncOutboxOpAction({ kind: "set_upsert", sessionId: "not-a-uuid", input: {} } as never)).toEqual({ error: "invalid_input" });
    expect(await syncOutboxOpAction({ kind: "bogus" } as never)).toEqual({ error: "invalid_input" });
    expect(h.getUser).not.toHaveBeenCalled();
  });

  it("answers `unauthenticated` (keep it queued, retry after re-auth) instead of letting RLS return an ambiguous no-op", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    expect(await syncOutboxOpAction(setUpsert())).toEqual({ error: "unauthenticated" });
    expect(h.logSet).not.toHaveBeenCalled();
  });
});

describe("syncOutboxOpAction: routing", () => {
  it("set_upsert -> logSet, ok or not_found_or_forbidden when RLS hid the session", async () => {
    expect(await syncOutboxOpAction(setUpsert())).toEqual({ ok: true });
    expect(h.logSet).toHaveBeenCalledWith(SESSION, expect.objectContaining({ program_item_id: ITEM, set_index: 1, weight: 50 }));
    h.logSet.mockResolvedValue(null);
    expect(await syncOutboxOpAction(setUpsert())).toEqual({ error: "not_found_or_forbidden" });
  });

  it("set_delete -> deleteSetByKey (idempotent: no result to check)", async () => {
    expect(await syncOutboxOpAction({ kind: "set_delete", sessionId: SESSION, programItemId: ITEM, setIndex: 2 })).toEqual({ ok: true });
    expect(h.deleteSetByKey).toHaveBeenCalledWith(SESSION, ITEM, 2);
  });

  it("exercise_result -> setExerciseResult", async () => {
    const op: OutboxOpInput = { kind: "exercise_result", sessionId: SESSION, programItemId: ITEM, input: { status: "done", pain: 1 } };
    expect(await syncOutboxOpAction(op)).toEqual({ ok: true });
    expect(h.setExerciseResult).toHaveBeenCalledWith(SESSION, ITEM, expect.objectContaining({ status: "done", pain: 1 }));
    h.setExerciseResult.mockResolvedValue(null);
    expect(await syncOutboxOpAction(op)).toEqual({ error: "not_found_or_forbidden" });
  });

  it("block_result -> saveBlockResult keyed by group, and refuses unknown fields or kinds", async () => {
    const result = { kind: "amrap", rounds: 5, extra_reps: 3, rx: true } as const;
    expect(await syncOutboxOpAction({ kind: "block_result", sessionId: SESSION, groupKey: "g1", result })).toEqual({ ok: true });
    expect(h.saveBlockResult).toHaveBeenCalledWith(SESSION, "g1", result);

    h.saveBlockResult.mockClear();
    const bad = [
      { kind: "block_result", sessionId: SESSION, groupKey: "g1", result: { kind: "bogus" } },
      { kind: "block_result", sessionId: SESSION, groupKey: "g1", result: { kind: "amrap", rounds: -1 } },
      { kind: "block_result", sessionId: SESSION, groupKey: "g1", result: { kind: "amrap", smuggled: "x" } }, // .strict()
      { kind: "block_result", sessionId: SESSION, groupKey: "", result },
    ];
    for (const op of bad) expect(await syncOutboxOpAction(op as never)).toEqual({ error: "invalid_input" });
    expect(h.saveBlockResult).not.toHaveBeenCalled();

    h.saveBlockResult.mockResolvedValue(false);
    expect(await syncOutboxOpAction({ kind: "block_result", sessionId: SESSION, groupKey: "g1", result })).toEqual({ error: "not_found_or_forbidden" });
  });

  it("session_complete -> completeSession with the duration", async () => {
    expect(await syncOutboxOpAction({ kind: "session_complete", sessionId: SESSION, durationSeconds: 1800 })).toEqual({ ok: true });
    expect(h.completeSession).toHaveBeenCalledWith(SESSION, 1800);
    expect(await syncOutboxOpAction({ kind: "session_complete", sessionId: SESSION, durationSeconds: 999_999 })).toEqual({ error: "invalid_input" });
  });
});

describe("syncOutboxOpAction: error mapping", () => {
  it("maps the 7-day immutability trigger (SQLSTATE 42501) to the permanent `entry_locked`", async () => {
    h.logSet.mockRejectedValue({ code: "42501", message: "stale" });
    expect(await syncOutboxOpAction(setUpsert())).toEqual({ error: "entry_locked" });
    h.deleteSetByKey.mockRejectedValue({ code: "42501" });
    expect(await syncOutboxOpAction({ kind: "set_delete", sessionId: SESSION, programItemId: ITEM, setIndex: 1 })).toEqual({ error: "entry_locked" });
  });

  it("lets any other failure throw, so the sync engine counts it as a retryable server fault", async () => {
    h.logSet.mockRejectedValue(new Error("connection reset"));
    await expect(syncOutboxOpAction(setUpsert())).rejects.toThrow("connection reset");
    h.logSet.mockRejectedValue({ code: "23505" });
    await expect(syncOutboxOpAction(setUpsert())).rejects.toBeTruthy();
  });
});
