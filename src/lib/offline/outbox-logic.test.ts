import { describe, expect, it } from "vitest";
import { backoffMs, pickRunnable, planEnqueue, MAX_ATTEMPTS, type OutboxPayload, type OutboxRow } from "./outbox-logic";

const S = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";

function row(seq: number, op: OutboxPayload, over: Partial<OutboxRow> = {}): OutboxRow {
  return { seq, sessionId: S, status: "pending", attempts: 0, nextAttemptAt: 0, lastError: null, createdAt: seq, op, ...over };
}
const create = (extra = {}): OutboxPayload => ({
  kind: "set_upsert",
  sessionId: S,
  input: { id: "set-1", client_logged_at: "2026-11-12T10:00:00.000Z", program_item_id: ITEM, set_index: 1, weight: 50, reps: 8, ...extra },
});

describe("backoffMs", () => {
  it("doubles per failure, with jitter bounds, and caps at 5 minutes", () => {
    expect(backoffMs(1, () => 0.5)).toBe(2_000);
    expect(backoffMs(2, () => 0.5)).toBe(4_000);
    expect(backoffMs(3, () => 0)).toBe(6_400); // 8000 * 0.8
    expect(backoffMs(20, () => 1)).toBe(360_000); // 300000 * 1.2
    expect(MAX_ATTEMPTS).toBeGreaterThan(1);
  });
});

describe("pickRunnable", () => {
  it("returns the oldest pending row that is due", () => {
    const rows = [row(2, create()), row(1, create({ set_index: 2 }))];
    expect(pickRunnable(rows, 100)?.seq).toBe(1);
  });

  it("a backing-off row blocks newer rows of the same session but not other sessions", () => {
    const other = "33333333-3333-4333-8333-333333333333";
    const rows = [
      row(1, create(), { nextAttemptAt: 1_000, attempts: 1 }),
      row(2, { kind: "set_delete", sessionId: S, programItemId: ITEM, setIndex: 1 }),
      row(3, { kind: "session_complete", sessionId: other, durationSeconds: 60 }, { sessionId: other }),
    ];
    expect(pickRunnable(rows, 500)?.seq).toBe(3);
    expect(pickRunnable(rows.slice(0, 2), 500)).toBeNull();
    expect(pickRunnable(rows, 1_000)?.seq).toBe(1);
  });

  it("skips failed rows without blocking, and never picks a syncing one", () => {
    const rows = [row(1, create(), { status: "failed" }), row(2, create({ set_index: 2 }))];
    expect(pickRunnable(rows, 0)?.seq).toBe(2);
    expect(pickRunnable([row(1, create(), { status: "syncing" }), row(2, create({ set_index: 2 }))], 0)).toBeNull();
  });
});

describe("planEnqueue", () => {
  it("inserts a fresh pending row when nothing is queued for that set", () => {
    const plan = planEnqueue([], create(), 5);
    expect(plan.removeSeqs).toEqual([]);
    expect(plan.put).toMatchObject({ status: "pending", attempts: 0, createdAt: 5 });
    expect(plan.put?.seq).toBeUndefined();
  });

  it("merges an edit into the queued create, keeping its position and client_logged_at", () => {
    const queued = row(4, create(), { status: "failed", attempts: 3, lastError: "x" });
    const edit: OutboxPayload = { kind: "set_upsert", sessionId: S, input: { id: "set-1", program_item_id: ITEM, set_index: 1, weight: 55 } };
    const plan = planEnqueue([queued], edit, 9);
    expect(plan.put).toMatchObject({ seq: 4, status: "pending", attempts: 0, lastError: null });
    expect(plan.put?.op).toMatchObject({ input: { weight: 55, reps: 8, client_logged_at: "2026-11-12T10:00:00.000Z" } });
  });

  it("deleting a set whose create never synced cancels it and queues nothing", () => {
    const plan = planEnqueue([row(4, create())], { kind: "set_delete", sessionId: S, programItemId: ITEM, setIndex: 1 }, 9);
    expect(plan).toEqual({ removeSeqs: [4], put: null });
  });

  it("deleting an already-synced set drops its queued edit but still queues the delete", () => {
    const edit = row(4, { kind: "set_upsert", sessionId: S, input: { program_item_id: ITEM, set_index: 1, weight: 55 } });
    const plan = planEnqueue([edit], { kind: "set_delete", sessionId: S, programItemId: ITEM, setIndex: 1 }, 9);
    expect(plan.removeSeqs).toEqual([4]);
    expect(plan.put?.op.kind).toBe("set_delete");
  });

  it("delete -> re-log -> delete again keeps the first delete so the server's old row still goes", () => {
    const firstDelete = row(1, { kind: "set_delete", sessionId: S, programItemId: ITEM, setIndex: 1 });
    const relog = row(2, create());
    const plan = planEnqueue([firstDelete, relog], { kind: "set_delete", sessionId: S, programItemId: ITEM, setIndex: 1 }, 9);
    expect(plan).toEqual({ removeSeqs: [2], put: null });
  });

  it("never touches a row that is mid-flight", () => {
    const inFlight = row(4, create(), { status: "syncing" });
    const plan = planEnqueue([inFlight], { kind: "set_delete", sessionId: S, programItemId: ITEM, setIndex: 1 }, 9);
    expect(plan.removeSeqs).toEqual([]);
    expect(plan.put?.op.kind).toBe("set_delete");
  });

  it("latest exercise_result / session_complete replaces the queued copy in place", () => {
    const first = row(2, { kind: "session_complete", sessionId: S, durationSeconds: 100 });
    const plan = planEnqueue([first], { kind: "session_complete", sessionId: S, durationSeconds: 120 }, 9);
    expect(plan.put).toMatchObject({ seq: 2, op: { durationSeconds: 120 } });
  });
});
