// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRestTimer } from "./use-rest-timer";

const vibrate = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T10:00:00Z"));
  vibrate.mockReset();
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("useRestTimer", () => {
  it("counts down from the wall clock", () => {
    const { result } = renderHook(() => useRestTimer());
    expect(result.current.isResting).toBe(false);

    act(() => result.current.start(60));
    expect(result.current).toMatchObject({ remaining: 60, duration: 60, isResting: true, paused: false });

    tick(10_000);
    expect(result.current.remaining).toBe(50);
  });

  it("stays correct when the tab was backgrounded and its timers were throttled", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(90));

    // 30 s pass on the clock but no interval tick runs (a throttled background tab)...
    vi.setSystemTime(Date.now() + 30_000);
    // ...and the next tick that does fire reads the real time, not a tick count.
    tick(250);
    expect(result.current.remaining).toBe(60);
  });

  it("finishes at 0, stops resting, and buzzes exactly once", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(3));
    tick(3_000);
    expect(result.current.remaining).toBe(0);
    expect(result.current.isResting).toBe(false);
    tick(2_000);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
  });

  it("pause freezes the time left and resume carries on from it", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(60));
    tick(20_000);

    act(() => result.current.pause());
    expect(result.current).toMatchObject({ paused: true, isResting: true, remaining: 40 });
    tick(30_000); // time passes while paused...
    expect(result.current.remaining).toBe(40); // ...and nothing is lost

    act(() => result.current.resume());
    tick(10_000);
    expect(result.current).toMatchObject({ paused: false, remaining: 30 });
  });

  it("adjust moves the time left, running or paused, and grows the bar's duration only when it must", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(60));
    tick(10_000);

    act(() => result.current.adjust(15));
    tick(250);
    expect(result.current.remaining).toBeGreaterThanOrEqual(64);
    expect(result.current.remaining).toBeLessThanOrEqual(65);
    expect(result.current.duration).toBe(65); // 50 left + 15 now exceeds the original 60

    act(() => result.current.pause());
    act(() => result.current.adjust(-1000)); // can never go below zero
    expect(result.current.remaining).toBe(0);
  });

  it("skip ends the rest immediately and a new start works again", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.start(60));
    act(() => result.current.skip());
    expect(result.current).toMatchObject({ remaining: 0, isResting: false, paused: false });

    act(() => result.current.start(30));
    expect(result.current).toMatchObject({ remaining: 30, isResting: true });
  });

  it("pause and resume with nothing running do nothing", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => result.current.pause());
    act(() => result.current.resume());
    expect(result.current).toMatchObject({ isResting: false, paused: false, remaining: 0 });
  });
});
