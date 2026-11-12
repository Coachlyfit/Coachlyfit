import { liveQuery } from "dexie";
import { getDb } from "./db";
import { planEnqueue, type OutboxPayload, type OutboxRow } from "./outbox-logic";

let persistAsked = false;

/** Ask the browser not to evict our storage. Safari/iOS only honours this for
 * an installed (Add to Home Screen) app, so it's a request, not a guarantee. */
function requestPersistentStorage() {
  if (persistAsked) return;
  persistAsked = true;
  try {
    void navigator.storage?.persist?.();
  } catch {
    // best effort
  }
}

/** Progressive enhancement (Chromium only): let the browser wake the service
 * worker when connectivity returns. Never relied on — see sync.ts triggers. */
function registerBackgroundSync() {
  try {
    void navigator.serviceWorker?.ready
      .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register("outbox-sync"))
      .catch(() => {});
  } catch {
    // best effort
  }
}

/** Saves an op locally. Resolves false when there is no usable IndexedDB (or
 * the write failed), so the caller can fall back to a direct online send. */
export async function enqueue(op: OutboxPayload): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.transaction("rw", db.outbox, async () => {
      const rows = await db.outbox.where("sessionId").equals(op.sessionId).toArray();
      const plan = planEnqueue(rows, op, Date.now());
      if (plan.removeSeqs.length) await db.outbox.bulkDelete(plan.removeSeqs);
      if (plan.put) await db.outbox.put(plan.put);
    });
  } catch {
    return false;
  }
  requestPersistentStorage();
  registerBackgroundSync();
  return true;
}

/** Live view of the whole outbox. Calls back with [] when IndexedDB is unavailable. */
export function observeOutbox(onRows: (rows: OutboxRow[]) => void): () => void {
  let unsubscribe = () => {};
  let cancelled = false;
  void getDb().then((db) => {
    if (cancelled) return;
    if (!db) return onRows([]);
    const sub = liveQuery(() => db.outbox.orderBy("seq").toArray()).subscribe({
      next: onRows,
      error: () => onRows([]),
    });
    unsubscribe = () => sub.unsubscribe();
  });
  return () => {
    cancelled = true;
    unsubscribe();
  };
}

/** A tab closed or crashed mid-request leaves rows stuck as "syncing". */
export async function resetStuckRows(): Promise<void> {
  const db = await getDb();
  await db?.outbox.where("status").equals("syncing").modify({ status: "pending", nextAttemptAt: 0 });
}

/** The user tapped Retry: give failed rows a clean slate. */
export async function retryFailed(): Promise<void> {
  const db = await getDb();
  await db?.outbox.where("status").equals("failed").modify({ status: "pending", attempts: 0, nextAttemptAt: 0, lastError: null });
}

/** The user gave up on rows that can never succeed (e.g. a set past its 7-day lock). */
export async function discardFailed(): Promise<void> {
  const db = await getDb();
  await db?.outbox.where("status").equals("failed").delete();
}
