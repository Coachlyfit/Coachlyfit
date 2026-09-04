"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Rest timer driven by a wall-clock end time rather than a plain
 * setInterval decrement counter — a backgrounded mobile tab throttles
 * timers, so a counter-based rest bar drifts by however long the tab was
 * backgrounded. Deriving remaining time from `Date.now()` on every tick
 * self-corrects regardless of how long the tick was actually delayed. */
export function useRestTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const vibratedRef = useRef(false);

  useEffect(() => {
    if (endsAt == null) return;
    vibratedRef.current = false;

    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !vibratedRef.current) {
        vibratedRef.current = true;
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const start = useCallback((seconds: number) => {
    setDuration(seconds);
    setEndsAt(Date.now() + seconds * 1000);
  }, []);

  const skip = useCallback(() => {
    setEndsAt(null);
    setRemaining(0);
  }, []);

  /** Adjusts the time remaining, not the original duration — so the
   * progress bar (remaining / duration) still shrinks toward the ±15s
   * button rather than jumping back to full width. */
  const adjust = useCallback((deltaSeconds: number) => {
    setEndsAt((prev) => {
      if (prev == null) return prev;
      const next = Math.max(Date.now(), prev + deltaSeconds * 1000);
      return next;
    });
  }, []);

  return { remaining, duration, isResting: endsAt != null && remaining > 0, start, skip, adjust };
}
