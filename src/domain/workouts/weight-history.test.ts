import { describe, expect, it } from "vitest";
import { WorkoutsService, type HistorySession } from "./workouts.service";
import {
  compareSessions,
  epley1rm,
  exerciseTimelines,
  metricValue,
  dateBounds,
  historyQuery,
  metricSeries,
  parseHistoryParams,
  sessionExercises,
  topSetsBySession,
} from "./weight-history";

const EX = "11111111-1111-4111-8111-111111111111";
const EX2 = "22222222-2222-4222-8222-222222222222";

function session(id: string, sets: [string, number, number | null, number | null][]): HistorySession {
  return {
    id,
    started_at: "2026-11-01T10:00:00Z",
    program_days: null,
    workout_set_logs: sets.map(([exercise_id, set_index, weight, reps]) => ({
      exercise_id,
      set_index,
      weight,
      reps,
      exercises: { name_ar: "ت", name_en: "Ex" },
    })),
  };
}

describe("parseHistoryParams", () => {
  it("drops malformed input and clamps the page size", () => {
    expect(parseHistoryParams({ ex: "not-a-uuid", from: "2026-13-99x", to: "nope", n: "abc" })).toEqual({
      exerciseId: undefined,
      from: undefined,
      to: undefined,
      limit: 10,
    });
    expect(parseHistoryParams({ ex: EX, from: "2026-01-01", to: "2026-02-01", n: "9999" })).toEqual({
      exerciseId: EX,
      from: "2026-01-01",
      to: "2026-02-01",
      limit: 200,
    });
  });
});

describe("historyQuery", () => {
  it("omits defaults and keeps the tab", () => {
    expect(historyQuery({ limit: 10 })).toBe("?tab=history");
    expect(historyQuery({ exerciseId: EX, from: "2026-01-01", limit: 30 })).toBe(
      `?tab=history&ex=${EX}&from=2026-01-01&n=30`
    );
  });
});

describe("dateBounds", () => {
  it("makes `to` inclusive by bounding at the next day", () => {
    expect(dateBounds("2026-01-01", "2026-01-31")).toEqual({
      fromIso: "2026-01-01T00:00:00.000Z",
      toIso: "2026-02-01T00:00:00.000Z",
    });
    expect(dateBounds()).toEqual({ fromIso: undefined, toIso: undefined });
  });
});

describe("sessionExercises", () => {
  it("collapses identical consecutive sets and tracks the top weight", () => {
    const [ex] = sessionExercises(
      session("s", [
        [EX, 2, 60, 8],
        [EX, 0, 60, 8],
        [EX, 1, 60, 8],
        [EX, 3, 65, 5],
      ])
    );
    expect(ex.groups).toEqual([
      { sets: 3, reps: 8, weight: 60 },
      { sets: 1, reps: 5, weight: 65 },
    ]);
    expect(ex.topWeight).toBe(65);
  });
});

describe("topSetsBySession", () => {
  it("keeps the heaviest set per session, oldest first, skipping bodyweight", () => {
    const pts = topSetsBySession([
      { session_id: "b", weight: 70, reps: 5, completed_at: "2026-02-01T00:00:00Z" },
      { session_id: "a", weight: 60, reps: 8, completed_at: "2026-01-01T00:00:00Z" },
      { session_id: "a", weight: 65, reps: 5, completed_at: "2026-01-01T00:10:00Z" },
      { session_id: "c", weight: null, reps: 10, completed_at: "2026-03-01T00:00:00Z" },
    ]);
    expect(pts).toEqual([
      { date: "2026-01-01T00:10:00Z", value: 65 },
      { date: "2026-02-01T00:00:00Z", value: 70 },
    ]);
  });
});

describe("compareSessions", () => {
  it("reports kg and % difference (B − A) and tolerates exercises in only one session", () => {
    const rows = compareSessions(
      session("a", [[EX, 0, 60, 8], [EX2, 0, 20, 10]]),
      session("b", [[EX, 0, 66, 8]])
    );
    const ex = rows.find((r) => r.exerciseId === EX)!;
    expect(ex).toMatchObject({ a: 60, b: 66, diffKg: 6, diffPct: 10 });
    const ex2 = rows.find((r) => r.exerciseId === EX2)!;
    expect(ex2).toMatchObject({ a: 20, b: null, diffKg: null, diffPct: null });
  });

  it("gives no percentage when A has no weight", () => {
    const [row] = compareSessions(session("a", [[EX, 0, 0, 10]]), session("b", [[EX, 0, 20, 10]]));
    expect(row.diffKg).toBe(20);
    expect(row.diffPct).toBeNull();
  });
});

describe("WorkoutsService.listHistorySessions", () => {
  function recorder(rows: unknown[]) {
    const calls: [string, unknown[]][] = [];
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lt", "order", "limit"]) {
      chain[m] = (...args: unknown[]) => {
        calls.push([m, args]);
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
    return { db: { from: () => chain } as never, calls };
  }

  it("filters by exercise and range, over-fetches by one, and reports hasMore", async () => {
    const rows = [1, 2, 3].map((i) => ({ id: String(i) }));
    const { db, calls } = recorder(rows);
    const res = await new WorkoutsService(db).listHistorySessions("c1", {
      fromIso: "2026-01-01T00:00:00.000Z",
      toIso: "2026-02-01T00:00:00.000Z",
      exerciseId: EX,
      limit: 2,
    });
    expect(res.sessions.map((s) => s.id)).toEqual(["1", "2"]);
    expect(res.hasMore).toBe(true);
    expect(calls).toContainEqual(["eq", ["client_id", "c1"]]);
    expect(calls).toContainEqual(["eq", ["workout_set_logs.exercise_id", EX]]);
    expect(calls).toContainEqual(["gte", ["started_at", "2026-01-01T00:00:00.000Z"]]);
    expect(calls).toContainEqual(["lt", ["started_at", "2026-02-01T00:00:00.000Z"]]);
    expect(calls).toContainEqual(["limit", [3]]);
  });
});

describe("metricSeries", () => {
  const pts = [
    { session_id: "a", weight: null, reps: null, duration_seconds: 45, distance_m: null, completed_at: "2026-01-01T10:00:00Z" },
    { session_id: "a", weight: null, reps: null, duration_seconds: 60, distance_m: null, completed_at: "2026-01-01T10:05:00Z" },
    { session_id: "b", weight: null, reps: null, duration_seconds: 90, distance_m: null, completed_at: "2026-01-08T10:00:00Z" },
  ];

  it("charts the longest hold per session, oldest first", () => {
    expect(metricSeries(pts, "duration")).toEqual([
      { date: "2026-01-01T10:05:00Z", value: 60 },
      { date: "2026-01-08T10:00:00Z", value: 90 },
    ]);
  });

  it("charts pace as seconds per km and keeps the FASTEST set per session", () => {
    const runs = [
      { session_id: "a", weight: null, reps: null, duration_seconds: 1800, distance_m: 5000, completed_at: "2026-01-01T10:00:00Z" },
      { session_id: "a", weight: null, reps: null, duration_seconds: 1500, distance_m: 5000, completed_at: "2026-01-01T10:40:00Z" },
    ];
    expect(metricSeries(runs, "pace")).toEqual([{ date: "2026-01-01T10:40:00Z", value: 300 }]);
  });

  it("charts max reps, distance and calories; types with no single number chart nothing", () => {
    const sets = [{ session_id: "a", weight: null, reps: 12, distance_m: 400, calories: 90, completed_at: "2026-01-01T10:00:00Z" }];
    expect(metricSeries(sets, "reps")[0].value).toBe(12);
    expect(metricSeries(sets, "distance")[0].value).toBe(400);
    expect(metricSeries(sets, "calories")[0].value).toBe(90);
    expect(metricSeries(sets, "extra")).toEqual([]);
  });
});

describe("sessionExercises for non-weight sets", () => {
  it("groups identical holds and carries the exercise's measurement type", () => {
    const s: HistorySession = {
      id: "s",
      started_at: "2026-11-01T10:00:00Z",
      program_days: null,
      workout_set_logs: [0, 1, 2].map((i) => ({
        exercise_id: EX,
        set_index: i,
        weight: null,
        reps: null,
        duration_seconds: 45,
        exercises: { name_ar: "ت", name_en: "Plank", measurement_type: "duration" },
      })),
    };
    const [ex] = sessionExercises(s);
    expect(ex.measurementType).toBe("duration");
    expect(ex.groups).toEqual([{ sets: 3, reps: null, weight: null, duration_seconds: 45 }]);
  });
});

describe("exerciseTimelines", () => {
  const at = (s: HistorySession, started_at: string): HistorySession => ({ ...s, started_at });
  // Newest first, like listHistorySessions returns them.
  const sessions = [
    at(session("s3", [[EX, 0, 140, 8]]), "2026-11-03T10:00:00Z"),
    at(session("s2", [[EX, 0, 140, 6], [EX, 1, 140, 10]]), "2026-11-02T10:00:00Z"),
    at(session("s1", [[EX, 0, 130, 10], [EX, 1, 100, 12], [EX2, 0, null, 15]]), "2026-11-01T10:00:00Z"),
  ];

  it("returns nothing for no sessions", () => {
    expect(exerciseTimelines([], true)).toEqual([]);
  });

  it("orders points oldest first and marks the first session as new only when nothing older exists", () => {
    const [ex] = exerciseTimelines(sessions, true);
    expect(ex.points.map((p) => p.sessionId)).toEqual(["s1", "s2", "s3"]);
    expect(ex.points[0].delta).toBe("new");
    expect(exerciseTimelines(sessions, false)[0].points[0].delta).toBeNull();
  });

  it("picks the heaviest set, ties broken by reps, and a tie in weight is a 0 delta", () => {
    const [ex] = exerciseTimelines(sessions, true);
    expect(ex.points[1].top).toEqual({ weight: 140, reps: 10 });
    expect(ex.points[1].delta).toBe(10);
    expect(ex.points[2].delta).toBe(0);
  });

  it("computes Epley 1RM from the best set and volume as Σ weight × reps", () => {
    const [ex] = exerciseTimelines(sessions, true);
    const s1 = ex.points[0];
    expect(s1.e1rm).toBeCloseTo(Math.max(epley1rm(130, 10), epley1rm(100, 12)));
    expect(s1.volume).toBe(130 * 10 + 100 * 12);
    expect(metricValue(s1, "e1rm")).toBe(173.3);
    expect(metricValue(s1, "volume")).toBe(2500);
  });

  it("keeps unweighted sessions as points with no top set, delta or metric", () => {
    const bw = exerciseTimelines(sessions, true).find((t) => t.exerciseId === EX2)!;
    expect(bw.points).toHaveLength(1);
    expect(bw.points[0]).toMatchObject({ top: null, e1rm: null, volume: 0, delta: null });
    expect(metricValue(bw.points[0], "top")).toBeNull();
    expect(metricValue(bw.points[0], "volume")).toBeNull();
  });
});
