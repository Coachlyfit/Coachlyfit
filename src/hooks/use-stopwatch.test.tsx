// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStopwatch } from "./use-stopwatch";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("useStopwatch", () => {
  it("starts idle, then counts elapsed time from the wall clock", () => {
    const { result } = renderHook(() => useStopwatch());
    expect(result.current).toMatchObject({ running: false, started: false, elapsedMs: 0 });

    act(() => result.current.start());
    tick(5_000);
    expect(result.current.running).toBe(true);
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(5_000);
    expect(result.current.elapsedMs).toBeLessThan(5_300);
  });

  it("survives a throttled background tab: elapsed comes from Date.now, not from counting ticks", () => {
    const { result } = renderHook(() => useStopwatch());
    act(() => result.current.start());
    vi.setSystemTime(Date.now() + 60_000);
    tick(250);
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(60_000);
  });

  it("stop freezes the value, returns it, and time passing no longer changes it", () => {
    const { result } = renderHook(() => useStopwatch());
    act(() => result.current.start());
    tick(3_000);
    let stopped = 0;
    act(() => {
      stopped = result.current.stop();
    });
    expect(stopped).toBeGreaterThanOrEqual(3_000);
    const frozen = result.current.elapsedMs;
    expect(result.current.running).toBe(false);
    tick(10_000);
    expect(result.current.elapsedMs).toBe(frozen);
  });

  it("reset clears it, stop before start is 0, and start again begins from zero", () => {
    const { result } = renderHook(() => useStopwatch());
    let early = -1;
    act(() => {
      early = result.current.stop();
    });
    expect(early).toBe(0);

    act(() => result.current.start());
    tick(2_000);
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ started: false, running: false, elapsedMs: 0 });

    act(() => result.current.start());
    expect(result.current.elapsedMs).toBe(0);
  });
});
