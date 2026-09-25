import { describe, expect, it } from "vitest";
import { evaluateOutcome, type DecisionForOutcome } from "./outcomes";
import type { ResultRow, SetLogRow, Signal } from "./signals";

const SINCE = "2026-09-01T00:00:00Z";
const NOW = new Date("2026-09-15T00:00:00Z"); // 14 days after SINCE — before the 28-day not_evaluable deadline
const PAST_DEADLINE = new Date("2026-10-05T00:00:00Z"); // 34 days after SINCE

function painSignal(maxPain: number): Extract<Signal, { kind: "pain_repeat" }> {
  return { kind: "pain_repeat", programItemId: "item-1", count: 2, lastAt: "2026-08-30T00:00:00Z", detail: { maxPain } };
}

function missedRepsSignal(missed: number, total: number): Extract<Signal, { kind: "missed_reps" }> {
  return { kind: "missed_reps", programItemId: "item-1", count: 2, lastAt: "2026-08-30T00:00:00Z", detail: { missed, total } };
}

function resultsAfter(sessionCount: number, pain: number): ResultRow[] {
  return Array.from({ length: sessionCount }, (_, i) => ({
    program_item_id: "item-1",
    session_id: `post-${i}`,
    pain,
    created_at: `2026-09-0${i + 2}T00:00:00Z`,
  }));
}

function logsAfter(sessionCount: number, hitEvery: boolean): SetLogRow[] {
  return Array.from({ length: sessionCount }, (_, i) => ({
    program_item_id: "item-1",
    session_id: `post-${i}`,
    reps: hitEvery ? 10 : 4,
    prescribed_reps: 10,
    completed_at: `2026-09-0${i + 2}T00:00:00Z`,
  }));
}

describe("evaluateOutcome — pain signals", () => {
  it("returns null while there aren't enough sessions yet, before the deadline", () => {
    const decision: DecisionForOutcome = { affectedItemIds: ["item-1"], evidence: [painSignal(3)], since: SINCE };
    const result = evaluateOutcome(decision, resultsAfter(1, 0), [], NOW);

    expect(result).toBeNull();
  });

  it("resolves when every later report is pain-free", () => {
    const decision: DecisionForOutcome = { affectedItemIds: ["item-1"], evidence: [painSignal(3)], since: SINCE };
    const result = evaluateOutcome(decision, resultsAfter(3, 0), [], NOW);

    expect(result).toMatchObject({ status: "resolved" });
  });

  it("marks worse when pain returns at or above the original peak", () => {
    const decision: DecisionForOutcome = { affectedItemIds: ["item-1"], evidence: [painSignal(3)], since: SINCE };
    const result = evaluateOutcome(decision, resultsAfter(3, 3), [], NOW);

    expect(result).toMatchObject({ status: "worse" });
  });

  it("marks persisting when pain is lower but not gone", () => {
    const decision: DecisionForOutcome = { affectedItemIds: ["item-1"], evidence: [painSignal(3)], since: SINCE };
    const result = evaluateOutcome(decision, resultsAfter(3, 1), [], NOW);

    expect(result).toMatchObject({ status: "persisting" });
  });

  it("only counts evidence for the decision's own affected items", () => {
    const decision: DecisionForOutcome = { affectedItemIds: ["item-2"], evidence: [painSignal(3)], since: SINCE };
    const result = evaluateOutcome(decision, resultsAfter(3, 0), [], PAST_DEADLINE);

    expect(result).toMatchObject({ status: "not_evaluable" });
  });
});

describe("evaluateOutcome — missed reps signals", () => {
  it("resolves once the hit rate recovers", () => {
    const decision: DecisionForOutcome = { affectedItemIds: ["item-1"], evidence: [missedRepsSignal(3, 4)], since: SINCE };
    const result = evaluateOutcome(decision, [], logsAfter(3, true), NOW);

    expect(result).toMatchObject({ status: "resolved" });
  });

  it("marks worse when the hit rate drops below what it was before", () => {
    const decision: DecisionForOutcome = { affectedItemIds: ["item-1"], evidence: [missedRepsSignal(1, 4)], since: SINCE };
    const result = evaluateOutcome(decision, [], logsAfter(3, false), NOW);

    expect(result).toMatchObject({ status: "worse" });
  });
});

describe("evaluateOutcome — combined and edge cases", () => {
  it("takes the worst sub-status when multiple signals are evaluated", () => {
    const decision: DecisionForOutcome = {
      affectedItemIds: ["item-1"],
      evidence: [painSignal(3), missedRepsSignal(1, 4)],
      since: SINCE,
    };
    const result = evaluateOutcome(decision, resultsAfter(3, 0), logsAfter(3, true), NOW);

    expect(result).toMatchObject({ status: "resolved" });

    const worseResult = evaluateOutcome(decision, resultsAfter(3, 3), logsAfter(3, true), NOW);
    expect(worseResult).toMatchObject({ status: "worse" });
  });

  it("returns not_evaluable once the deadline passes without enough sessions", () => {
    const decision: DecisionForOutcome = { affectedItemIds: ["item-1"], evidence: [painSignal(3)], since: SINCE };
    const result = evaluateOutcome(decision, resultsAfter(1, 0), [], PAST_DEADLINE);

    expect(result).toMatchObject({ status: "not_evaluable" });
  });

  it("returns not_evaluable for a decision with no re-checkable evidence at all", () => {
    const decision: DecisionForOutcome = { affectedItemIds: [], evidence: [], since: SINCE };
    const result = evaluateOutcome(decision, [], [], NOW);

    expect(result).toMatchObject({ status: "not_evaluable" });
  });
});
