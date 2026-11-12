import { syncOutboxOpAction } from "@/domain/workouts/workouts-actions";
import { createClient } from "@/lib/supabase/client";
import { getDb } from "./db";
import { enqueue } from "./outbox";
import { MAX_ATTEMPTS, PERMANENT_ERRORS, backoffMs, pickRunnable, type OutboxPayload, type OutboxRow } from "./outbox-logic";

// ---- tiny external store the UI subscribes to (useSyncExternalStore) -------

export type SyncState = {
  /** Best guess from real requests (and the browser's online/offline events) —
   * navigator.onLine alone lies on captive portals and flaky signal. */
  online: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;
  /** "unavailable" = no usable IndexedDB; offline logging is off. */
  storage: "unknown" | "ok" | "unavailable";
};

let state: SyncState = { online: true, syncing: false, lastSyncedAt: null, storage: "unknown" };
const listeners = new Set<() => void>();

function patch(next: Partial<SyncState>) {
  const merged = { ...state, ...next };
  if ((Object.keys(merged) as (keyof SyncState)[]).every((k) => merged[k] === state[k])) return;
  state = merged;
  listeners.forEach((l) => l());
}

export const subscribeSyncState = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const getSyncState = () => state;
export const setOnline = (online: boolean) => patch({ online });
export const setStorage = (storage: SyncState["storage"]) => patch({ storage });

// ---- sync engine ------------------------------------------------------------

type Outcome = "continue" | "stop";

/** Thrown fetches (no network, DNS, aborted) are TypeErrors; treat the
 * browser's own offline flag the same way. Anything else the action threw is
 * a server fault, which counts as an attempt. */
function looksOffline(err: unknown): boolean {
  return (typeof navigator !== "undefined" && navigator.onLine === false) || err instanceof TypeError;
}

/** Refreshes the session through the browser client (getUser() renews an
 * expired access token) before touching the server. Anything but a confirmed
 * user leaves the queue untouched. */
async function sessionReady(): Promise<boolean> {
  try {
    const { data, error } = await createClient().auth.getUser();
    if (error) {
      if (error.name === "AuthRetryableFetchError") patch({ online: false });
      return false;
    }
    return data.user != null;
  } catch (err) {
    if (looksOffline(err)) patch({ online: false });
    return false;
  }
}

async function runOne(row: OutboxRow): Promise<Outcome> {
  const db = (await getDb())!;
  const seq = row.seq!;
  await db.outbox.update(seq, { status: "syncing" });

  const retryLater = (error: string, countAttempt: boolean) => {
    const attempts = row.attempts + (countAttempt ? 1 : 0);
    const failed = attempts >= MAX_ATTEMPTS;
    return db.outbox.update(seq, {
      status: failed ? "failed" : "pending",
      attempts,
      lastError: error,
      nextAttemptAt: countAttempt ? Date.now() + backoffMs(attempts) : 0,
    });
  };

  let result: Awaited<ReturnType<typeof syncOutboxOpAction>>;
  try {
    result = await syncOutboxOpAction(row.op);
  } catch (err) {
    if (looksOffline(err)) {
      patch({ online: false });
      await retryLater("offline", false);
      return "stop";
    }
    await retryLater("server_error", true);
    return "continue";
  }

  patch({ online: true });
  if ("ok" in result) {
    // Only now, with the server's confirmation, does the local copy go.
    await db.outbox.delete(seq);
    return "continue";
  }
  if (result.error === "unauthenticated") {
    await retryLater("unauthenticated", false);
    return "stop";
  }
  if (PERMANENT_ERRORS.has(result.error)) {
    await db.outbox.update(seq, { status: "failed", attempts: row.attempts + 1, lastError: result.error });
    return "continue";
  }
  await retryLater(result.error, true);
  return "continue";
}

let running = false;

/** Drains whatever is due. Safe to call from anywhere, any number of times
 * (single-flight); every trigger — app load, `online`, visibilitychange, the
 * Sync-now button, the backoff timer, the SW sync message — just calls this. */
export async function syncNow(): Promise<void> {
  if (running) return;
  const db = await getDb();
  patch({ storage: db ? "ok" : "unavailable" });
  if (!db || !pickRunnable(await db.outbox.toArray(), Date.now())) return;

  running = true;
  patch({ syncing: true });
  try {
    if (!(await sessionReady())) return;
    let synced = false;
    for (;;) {
      const next = pickRunnable(await db.outbox.toArray(), Date.now());
      if (!next) break;
      if ((await runOne(next)) === "stop") break;
      synced = true;
    }
    if (synced) patch({ lastSyncedAt: Date.now() });
  } finally {
    running = false;
    patch({ syncing: false });
  }
}

export type SubmitResult = { status: "queued" } | { status: "done" } | { status: "error"; error: string };

/** The single write path of the workout runner: save locally first, then try
 * to sync in the background. Without a usable IndexedDB it degrades to the
 * old direct online call, so the caller handles the error like it always did. */
export async function submitOp(op: OutboxPayload): Promise<SubmitResult> {
  if (await enqueue(op)) {
    void syncNow();
    return { status: "queued" };
  }
  patch({ storage: "unavailable" });
  try {
    const result = await syncOutboxOpAction(op);
    return "error" in result ? { status: "error", error: result.error } : { status: "done" };
  } catch {
    return { status: "error", error: "network" };
  }
}
