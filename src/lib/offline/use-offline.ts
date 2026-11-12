"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { observeOutbox } from "./outbox";
import { setSyncStatus, summarizeOutbox, type OutboxRow } from "./outbox-logic";
import { getSyncState, subscribeSyncState } from "./sync";

const SERVER_STATE = { online: true, syncing: false, lastSyncedAt: null, storage: "unknown" } as const;

export function useSyncState() {
  return useSyncExternalStore(subscribeSyncState, getSyncState, () => SERVER_STATE);
}

/** Live outbox rows ([] until IndexedDB answers, and forever if it's unavailable). */
export function useOutboxRows(): OutboxRow[] {
  const [rows, setRows] = useState<OutboxRow[]>([]);
  useEffect(() => observeOutbox(setRows), []);
  return rows;
}

export function useOutboxSummary() {
  const rows = useOutboxRows();
  return useMemo(() => summarizeOutbox(rows), [rows]);
}

/** Per-set "pending" / "failed" sync badges for one session. */
export function useSetSyncStatus(sessionId: string) {
  const rows = useOutboxRows();
  return useMemo(() => setSyncStatus(rows, sessionId), [rows, sessionId]);
}
