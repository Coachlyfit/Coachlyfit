"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Rest timer driven by a wall-clock end time rather than a plain
 * setInterval decrement counter — a backgrounded mobile tab throttles
 * timers, so a counter-based rest bar drifts by however long the tab was
 * backgrounded. Deriving remaining time from `Date.now()` on every tick
 * self-corrects regardless of how long the tick was actually delayed.
 * Pausing freezes the seconds left (`pausedLeft`) and drops the end time;
 * resuming re-derives a fresh end time from it. */
export function useRestTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
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
    setPausedLeft(null);
    setDuration(seconds);
    setRemaining(seconds);
    setEndsAt(Date.now() + seconds * 1000);
  }, []);

  const skip = useCallback(() => {
    setPausedLeft(null);
    setEndsAt(null);
    setRemaining(0);
  }, []);

  const pause = useCallback(() => {
    if (endsAt == null) return;
    const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    setEndsAt(null);
    setPausedLeft(left);
    setRemaining(left);
  }, [endsAt]);

  const resume = useCallback(() => {
    if (pausedLeft == null) return;
    setEndsAt(Date.now() + pausedLeft * 1000);
    setPausedLeft(null);
  }, [pausedLeft]);

  /** Adjusts the time remaining; `duration` only grows if remaining would
   * exceed it, so the progress bar never overflows. */
  const adjust = useCallback(
    (deltaSeconds: number) => {
      if (pausedLeft != null) {
        const next = Math.max(0, pausedLeft + deltaSeconds);
        setPausedLeft(next);
        setRemaining(next);
        setDuration((d) => Math.max(d, next));
        return;
      }
      if (endsAt == null) return;
      const next = Math.max(Date.now(), endsAt + deltaSeconds * 1000);
      setEndsAt(next);
      setDuration((d) => Math.max(d, Math.ceil((next - Date.now()) / 1000)));
    },
    [endsAt, pausedLeft]
  );

  const paused = pausedLeft != null;
  return {
    remaining,
    duration,
    paused,
    isResting: paused || (endsAt != null && remaining > 0),
    start,
    skip,
    pause,
    resume,
    adjust,
  };
}
