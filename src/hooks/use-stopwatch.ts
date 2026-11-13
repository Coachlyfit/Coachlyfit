"use client";

import { useCallback, useEffect, useState } from "react";

/** Wall-clock stopwatch for timed blocks. Elapsed time is always derived from
 * `Date.now() - startedAt`, never from counting ticks, so a backgrounded tab
 * (timers throttled) still reads correctly when it comes back — same reasoning
 * as use-rest-timer.ts. `stop()` freezes the elapsed value; `reset()` clears. */
export function useStopwatch() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [frozenMs, setFrozenMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt == null || frozenMs != null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startedAt, frozenMs]);

  const start = useCallback(() => {
    const t = Date.now();
    setNow(t);
    setFrozenMs(null);
    setStartedAt(t);
  }, []);

  const stop = useCallback(() => {
    if (startedAt == null) return 0;
    const ms = Math.max(0, Date.now() - startedAt);
    setFrozenMs(ms);
    return ms;
  }, [startedAt]);

  const reset = useCallback(() => {
    setStartedAt(null);
    setFrozenMs(null);
  }, []);

  const running = startedAt != null && frozenMs == null;
  const elapsedMs = frozenMs ?? (startedAt != null ? Math.max(0, now - startedAt) : 0);
  return { running, started: startedAt != null, elapsedMs, start, stop, reset };
}
