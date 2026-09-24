import { describe, expect, it } from "vitest";
import { detectMissedReps, detectPainRepeat, repeatedNoteSignal, type ResultRow, type SetLogRow } from "./signals";

const NOW = new Date("2026-09-24T12:00:00Z");

describe("detectPainRepeat", () => {
  it("flags an item with pain > 0 in two distinct sessions within the window", () => {
    const results: ResultRow[] = [
      { program_item_id: "item-1", session_id: "s1", pain: 2, created_at: "2026-09-20T10:00:00Z" },
      { program_item_id: "item-1", session_id: "s2", pain: 3, created_at: "2026-09-22T10:00:00Z" },
    ];

    const signals = detectPainRepeat(results, NOW);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: "pain_repeat", programItemId: "item-1", count: 2, detail: { maxPain: 3 } });
  });

  it("does not flag a single pain report", () => {
    const results: ResultRow[] = [{ program_item_id: "item-1", session_id: "s1", pain: 2, created_at: "2026-09-22T10:00:00Z" }];

    expect(detectPainRepeat(results, NOW)).toEqual([]);
  });

  it("ignores pain reports outside the window", () => {
    const results: ResultRow[] = [
      { program_item_id: "item-1", session_id: "s1", pain: 2, created_at: "2026-08-01T10:00:00Z" },
      { program_item_id: "item-1", session_id: "s2", pain: 3, created_at: "2026-09-22T10:00:00Z" },
    ];

    expect(detectPainRepeat(results, NOW)).toEqual([]);
  });

  it("does not count repeated pain rows in the same session twice", () => {
    const results: ResultRow[] = [
      { program_item_id: "item-1", session_id: "s1", pain: 1, created_at: "2026-09-22T10:00:00Z" },
      { program_item_id: "item-1", session_id: "s1", pain: 2, created_at: "2026-09-22T10:05:00Z" },
    ];

    expect(detectPainRepeat(results, NOW)).toEqual([]);
  });

  it("ignores zero and null pain scores", () => {
    const results: ResultRow[] = [
      { program_item_id: "item-1", session_id: "s1", pain: 0, created_at: "2026-09-20T10:00:00Z" },
      { program_item_id: "item-1", session_id: "s2", pain: null, created_at: "2026-09-22T10:00:00Z" },
    ];

    expect(detectPainRepeat(results, NOW)).toEqual([]);
  });
});

describe("detectMissedReps", () => {
  it("flags an item whose last two sessions missed at least half their sets", () => {
    const logs: SetLogRow[] = [
      { program_item_id: "item-1", session_id: "s1", reps: 6, prescribed_reps: 10, completed_at: "2026-09-15T10:00:00Z" },
      { program_item_id: "item-1", session_id: "s1", reps: 10, prescribed_reps: 10, completed_at: "2026-09-15T10:01:00Z" },
      { program_item_id: "item-1", session_id: "s2", reps: 7, prescribed_reps: 10, completed_at: "2026-09-18T10:00:00Z" },
      { program_item_id: "item-1", session_id: "s2", reps: 8, prescribed_reps: 10, completed_at: "2026-09-18T10:01:00Z" },
    ];

    const signals = detectMissedReps(logs);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: "missed_reps", programItemId: "item-1", count: 2, detail: { missed: 3, total: 4 } });
  });

  it("does not flag when most sets hit target", () => {
    const logs: SetLogRow[] = [
      { program_item_id: "item-1", session_id: "s1", reps: 10, prescribed_reps: 10, completed_at: "2026-09-15T10:00:00Z" },
      { program_item_id: "item-1", session_id: "s2", reps: 10, prescribed_reps: 10, completed_at: "2026-09-18T10:00:00Z" },
    ];

    expect(detectMissedReps(logs)).toEqual([]);
  });

  it("needs at least two distinct sessions of history", () => {
    const logs: SetLogRow[] = [{ program_item_id: "item-1", session_id: "s1", reps: 4, prescribed_reps: 10, completed_at: "2026-09-18T10:00:00Z" }];

    expect(detectMissedReps(logs)).toEqual([]);
  });

  it("only looks at the exercise's last two sessions, not every session ever", () => {
    const logs: SetLogRow[] = [
      { program_item_id: "item-1", session_id: "s1", reps: 4, prescribed_reps: 10, completed_at: "2026-09-01T10:00:00Z" },
      { program_item_id: "item-1", session_id: "s2", reps: 10, prescribed_reps: 10, completed_at: "2026-09-15T10:00:00Z" },
      { program_item_id: "item-1", session_id: "s3", reps: 10, prescribed_reps: 10, completed_at: "2026-09-18T10:00:00Z" },
    ];

    expect(detectMissedReps(logs)).toEqual([]);
  });

  it("excludes sets with no logged reps or no recorded prescription", () => {
    const logs: SetLogRow[] = [
      { program_item_id: "item-1", session_id: "s1", reps: null, prescribed_reps: 10, completed_at: "2026-09-15T10:00:00Z" },
      { program_item_id: "item-1", session_id: "s2", reps: 4, prescribed_reps: null, completed_at: "2026-09-18T10:00:00Z" },
    ];

    expect(detectMissedReps(logs)).toEqual([]);
  });
});

describe("repeatedNoteSignal", () => {
  it("wraps similar notes into a signal", () => {
    const signal = repeatedNoteSignal([{ checkin_date: "2026-09-13", text: "الركبة بتوجعني" }]);

    expect(signal).toMatchObject({ kind: "repeated_note", count: 1, lastAt: "2026-09-13" });
  });

  it("returns null when there are no similar notes", () => {
    expect(repeatedNoteSignal([])).toBeNull();
  });
});
