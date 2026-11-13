import type { ExerciseResultInput, LogSetInput } from "@/domain/workouts/workouts.service";
import type { BlockResult } from "@/domain/workouts/block-result";

// Pure outbox rules (ordering, backoff, coalescing). No IndexedDB here so it
// runs under plain vitest; db.ts / outbox.ts / sync.ts do the I/O.

export type OutboxPayload =
  | { kind: "set_upsert"; sessionId: string; input: LogSetInput }
  | { kind: "set_delete"; sessionId: string; programItemId: string; setIndex: number }
  | { kind: "exercise_result"; sessionId: string; programItemId: string; input: ExerciseResultInput }
  | { kind: "block_result"; sessionId: string; groupKey: string; result: BlockResult }
  | { kind: "session_complete"; sessionId: string; durationSeconds: number };

export type OutboxStatus = "pending" | "syncing" | "failed";

export type OutboxRow = {
  /** Auto-increment; FIFO order and the coalescing slot. Undefined before insert. */
  seq?: number;
  sessionId: string;
  status: OutboxStatus;
  attempts: number;
  /** epoch ms — not runnable before this (backoff). */
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
  op: OutboxPayload;
};

export const MAX_ATTEMPTS = 6;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5 * 60_000;

/** Server errors that retrying can't fix — straight to "failed". */
export const PERMANENT_ERRORS = new Set(["invalid_input", "entry_locked", "not_found_or_forbidden"]);

/** Exponential backoff with ±20% jitter, capped. `attempts` counts failures so far (>= 1). */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(exp * (0.8 + random() * 0.4));
}

/** What the sync loop should do next. Oldest first; a `pending` row that is
 * still backing off blocks the newer rows of its own session (a set_delete
 * must never overtake the set_upsert before it). `failed` rows don't block. */
export function pickRunnable(rows: OutboxRow[], now: number): OutboxRow | null {
  const blocked = new Set<string>();
  for (const row of [...rows].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
    if (row.status === "failed") continue;
    if (blocked.has(row.sessionId)) continue;
    if (row.status === "pending" && row.nextAttemptAt <= now) return row;
    blocked.add(row.sessionId); // backing off, or already syncing
  }
  return null;
}

/** Rows still waiting to reach the server (pending or in flight) and rows that gave up. */
export function summarizeOutbox(rows: OutboxRow[]): { pending: number; failed: number } {
  const failed = rows.filter((r) => r.status === "failed").length;
  return { pending: rows.length - failed, failed };
}

/** Per-set sync badge for one session, keyed `${program_item_id}-${set_index}`
 * (the runner's own log key). Absent = the server already has it. */
export function setSyncStatus(rows: OutboxRow[], sessionId: string): Map<string, "pending" | "failed"> {
  const map = new Map<string, "pending" | "failed">();
  for (const r of rows) {
    if (r.sessionId !== sessionId || r.op.kind !== "set_upsert") continue;
    map.set(`${r.op.input.program_item_id}-${r.op.input.set_index}`, r.status === "failed" ? "failed" : "pending");
  }
  return map;
}

export function setKey(sessionId: string, programItemId: string, setIndex: number): string {
  return `${sessionId}:${programItemId}:${setIndex}`;
}

function slotOf(op: OutboxPayload): string | null {
  switch (op.kind) {
    case "set_upsert":
      return setKey(op.sessionId, op.input.program_item_id, op.input.set_index);
    case "set_delete":
      return setKey(op.sessionId, op.programItemId, op.setIndex);
    case "exercise_result":
      return `result:${op.sessionId}:${op.programItemId}`;
    case "block_result":
      return `block:${op.sessionId}:${op.groupKey}`;
    case "session_complete":
      return `complete:${op.sessionId}`;
  }
}

/** `put: null` = nothing to store (a delete cancelled a never-synced create). */
export type EnqueuePlan = { removeSeqs: number[]; put: OutboxRow | null };

/** Decides how a new op folds into the queue, so the outbox stays one row per
 * thing that changed:
 *  - an edit of a set that is still queued merges into that row (keeping its
 *    queue position and its creation-only client_logged_at);
 *  - deleting a set whose creation never left the device cancels both;
 *  - exercise results / completion replace their earlier queued copy.
 * Rows currently `syncing` are never touched (the request is in flight). */
export function planEnqueue(rows: OutboxRow[], op: OutboxPayload, now: number): EnqueuePlan {
  const slot = slotOf(op);
  const same = rows.filter((r) => r.status !== "syncing" && slotOf(r.op) === slot);
  const fresh = (over: Partial<OutboxRow> = {}): OutboxRow => ({
    sessionId: op.sessionId,
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    createdAt: now,
    op,
    ...over,
  });
  if (op.kind === "set_upsert") {
    const queued = same.find((r) => r.op.kind === "set_upsert");
    if (queued && queued.op.kind === "set_upsert") {
      const merged = { ...queued.op.input, ...op.input };
      return { removeSeqs: [], put: { ...queued, status: "pending", attempts: 0, nextAttemptAt: 0, lastError: null, op: { ...op, input: merged } } };
    }
    return { removeSeqs: [], put: fresh() };
  }

  if (op.kind === "set_delete") {
    const upserts = same.filter((r) => r.op.kind === "set_upsert");
    const createCancelled = upserts.some((r) => r.op.kind === "set_upsert" && r.op.input.client_logged_at != null);
    // An earlier queued delete (of a set the server already has) must survive:
    // delete -> re-log -> delete again still has to remove the server's row.
    const deleteQueued = same.some((r) => r.op.kind === "set_delete");
    return {
      removeSeqs: upserts.map((r) => r.seq!),
      put: createCancelled || deleteQueued ? null : fresh(),
    };
  }

  // exercise_result / block_result / session_complete: latest wins, queue position of the first.
  const queued = same[0];
  if (queued) return { removeSeqs: [], put: { ...queued, status: "pending", attempts: 0, nextAttemptAt: 0, lastError: null, op } };
  return { removeSeqs: [], put: fresh() };
}
