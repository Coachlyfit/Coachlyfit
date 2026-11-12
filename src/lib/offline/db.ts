import Dexie, { type Table } from "dexie";
import type { OutboxRow } from "./outbox-logic";

class OfflineDb extends Dexie {
  outbox!: Table<OutboxRow, number>;

  constructor() {
    super("coachly-offline");
    this.version(1).stores({ outbox: "++seq, sessionId, status" });
  }
}

let opening: Promise<OfflineDb | null> | null = null;

/** The local database, or null when IndexedDB is missing or refuses to open
 * (old Firefox private mode, locked-down WebViews). Callers must treat null
 * as "no offline support, send online like before" — never assume it. */
export function getDb(): Promise<OfflineDb | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  opening ??= (async () => {
    try {
      const db = new OfflineDb();
      await db.open();
      return db;
    } catch {
      return null;
    }
  })();
  return opening;
}
