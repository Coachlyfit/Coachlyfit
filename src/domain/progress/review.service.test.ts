import { describe, expect, it } from "vitest";
import { ReviewService } from "./review.service";

type Call = { method: string; args: unknown[] };

function fakeDb(rows: unknown[], rpcResult: { data: unknown; error: unknown } = { data: null, error: null }) {
  const calls: Call[] = [];
  const fromCalls: string[] = [];
  const rpcCalls: { fn: string; args: unknown }[] = [];

  function chain() {
    const record = (method: string) => (...args: unknown[]) => {
      calls.push({ method, args });
      return proxy;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, not a real PromiseLike
    const proxy: any = {
      select: record("select"),
      eq: record("eq"),
      neq: record("neq"),
      is: record("is"),
      not: record("not"),
      order: record("order"),
      limit: record("limit"),
      then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: rows, error: null }),
    };
    return proxy;
  }

  const db = {
    from(table: string) {
      fromCalls.push(table);
      return { select: chain().select };
    },
    rpc(fn: string, args: unknown) {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcResult);
    },
  };

  return { db, calls, fromCalls, rpcCalls };
}

describe("ReviewService", () => {
  it("lists the pending queue oldest-first, unreviewed only", async () => {
    const rows = [{ id: "1", client_id: "c1" }];
    const { db, calls, fromCalls } = fakeDb(rows);
    const service = new ReviewService(db as never);

    const result = await service.listPendingQueue();

    expect(fromCalls).toEqual(["checkins"]);
    expect(calls).toContainEqual({ method: "is", args: ["reviewed_at", null] });
    expect(calls).toContainEqual({ method: "order", args: ["checkin_date", { ascending: true }] });
    expect(result).toBe(rows);
  });

  it("lists recent notes for a client, excluding the current check-in and nulls", async () => {
    const rows = [{ checkin_date: "2026-07-20", notes: "الركبة بتوجعني" }];
    const { db, calls, fromCalls } = fakeDb(rows);
    const service = new ReviewService(db as never);

    const result = await service.listRecentNotes("client-1", "checkin-1");

    expect(fromCalls).toEqual(["checkins"]);
    expect(calls).toContainEqual({ method: "eq", args: ["client_id", "client-1"] });
    expect(calls).toContainEqual({ method: "neq", args: ["id", "checkin-1"] });
    expect(calls).toContainEqual({ method: "not", args: ["notes", "is", null] });
    expect(calls).toContainEqual({ method: "order", args: ["checkin_date", { ascending: false }] });
    expect(result).toBe(rows);
  });

  it("submits a review via the review_checkin RPC", async () => {
    const reviewed = { id: "checkin-1", decision: "adjust" };
    const { db, rpcCalls } = fakeDb([], { data: reviewed, error: null });
    const service = new ReviewService(db as never);

    const result = await service.reviewCheckin("checkin-1", {
      decision: "adjust",
      adjustments: ["نزّل وزن السكوات ٢٠٪"],
      coachReply: "تمام يا سارة",
    });

    expect(rpcCalls).toEqual([
      {
        fn: "review_checkin",
        args: {
          p_checkin_id: "checkin-1",
          p_decision: "adjust",
          p_adjustments: ["نزّل وزن السكوات ٢٠٪"],
          p_coach_reply: "تمام يا سارة",
        },
      },
    ]);
    expect(result).toBe(reviewed);
  });

  it("throws when the RPC returns an error", async () => {
    const { db } = fakeDb([], { data: null, error: new Error("Coach only.") });
    const service = new ReviewService(db as never);

    await expect(service.reviewCheckin("checkin-1", { decision: "keep" })).rejects.toThrow("Coach only.");
  });
});
