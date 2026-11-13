import { describe, expect, it } from "vitest";
import { PLAN_TYPES } from "../plan-meta";
import { isTimedKind } from "../group-config";
import { STARTERS, starterExerciseNames } from "./index";
import { createFromStarter } from "./starters.service";

describe("starter data", () => {
  it("covers every plan type exactly once", () => {
    expect(STARTERS.map((s) => s.plan_type).sort()).toEqual([...PLAN_TYPES].sort());
    expect(new Set(STARTERS.map((s) => s.id)).size).toBe(STARTERS.length);
  });

  it("only uses exercise names that are safe inside a PostgREST ilike filter", () => {
    for (const s of STARTERS) {
      for (const name of starterExerciseNames(s)) expect(name).toMatch(/^[A-Za-z0-9' -]+$/);
    }
  });

  it("every item has a measure, and grouped items are consecutive and reference a declared group", () => {
    for (const s of STARTERS) {
      for (const day of s.days) {
        expect(day.items.length).toBeGreaterThan(0);
        const seenClosed = new Set<string>();
        let open: string | null = null;
        for (const item of day.items) {
          expect(item.sets.length).toBeGreaterThan(0);
          for (const set of item.sets) {
            expect(
              set.reps != null || set.duration_seconds != null || set.distance_m != null || set.calories != null || set.extra != null
            ).toBe(true);
          }
          const g = item.group ?? null;
          if (g !== open) {
            if (open) seenClosed.add(open);
            if (g) {
              expect(seenClosed.has(g), `${s.id}: group ${g} is split`).toBe(false);
              expect(day.groups?.[g], `${s.id}: group ${g} not declared`).toBeDefined();
            }
            open = g;
          }
        }
      }
    }
  });

  it("timed groups carry the numbers their clock needs", () => {
    for (const s of STARTERS) {
      for (const day of s.days) {
        for (const g of Object.values(day.groups ?? {})) {
          if (!isTimedKind(g.kind)) continue;
          const c = g.config ?? {};
          if (g.kind === "amrap") expect(c.time_cap_s).toBeGreaterThan(0);
          if (g.kind === "emom") expect(c.interval_s && c.rounds).toBeTruthy();
          if (g.kind === "tabata") expect(c.work_s && c.rounds).toBeTruthy();
        }
      }
    }
  });
});

describe("createFromStarter", () => {
  const starter = STARTERS.find((s) => s.id === "crossfit-wods")!;

  function stubs(known: string[]) {
    const calls: { fn: string; args: unknown[] }[] = [];
    const rec =
      (fn: string, ret: (args: unknown[]) => unknown) =>
      async (...args: unknown[]) => {
        calls.push({ fn, args });
        return ret(args);
      };
    let n = 0;
    const programs = {
      create: rec("create", () => ({ id: "prog-1" })),
      addDay: rec("addDay", () => ({ id: `day-${++n}` })),
      addItem: rec("addItem", () => ({ id: `item-${++n}` })),
      reorderDays: rec("reorderDays", () => 1),
      reorderItems: rec("reorderItems", () => 1),
      groupItems: rec("groupItems", () => 1),
      remove: rec("remove", () => true),
    };
    const db = {
      from: () => ({
        select: () => ({
          is: () => ({
            is: () => ({
              or: async () => ({ data: known.map((name_en, i) => ({ id: `ex-${i}`, name_en })), error: null }),
            }),
          }),
        }),
      }),
    };
    return { calls, programs: programs as never, db: db as never };
  }

  it("builds the template, groups the timed blocks, and orders days and items", async () => {
    const all = starterExerciseNames(starter).map((n) => n.toLowerCase()); // case-insensitive lookup
    const { calls, programs, db } = stubs(all);
    const result = await createFromStarter(db, "coach-1", starter, programs);

    expect(result).toEqual({ programId: "prog-1", skipped: [] });
    const create = calls.find((c) => c.fn === "create")!.args[1] as Record<string, unknown>;
    expect(create).toMatchObject({ client_id: null, plan_type: "crossfit", goal: "performance", level: "intermediate" });
    expect(calls.filter((c) => c.fn === "addDay")).toHaveLength(3);
    const groups = calls.filter((c) => c.fn === "groupItems").map((c) => c.args[1]);
    expect(groups).toEqual(["amrap", "for_time", "emom"]);
    expect(calls.some((c) => c.fn === "reorderDays")).toBe(true);
    expect(calls.some((c) => c.fn === "remove")).toBe(false);
  });

  it("skips exercises the library lacks and leaves a one-member group ungrouped", async () => {
    const known = starterExerciseNames(starter).filter((n) => n !== "Wall Ball" && n !== "Box Jump").map((n) => n.toLowerCase());
    const { calls, programs, db } = stubs(known);
    const result = await createFromStarter(db, "coach-1", starter, programs);

    expect(result.skipped.sort()).toEqual(["Box Jump", "Wall Ball"]);
    // for_time day is left with a single Pull-Up -> not a group
    expect(calls.filter((c) => c.fn === "groupItems").map((c) => c.args[1])).toEqual(["amrap", "emom"]);
  });

  it("removes the half-built program when a step fails", async () => {
    const { calls, programs, db } = stubs(starterExerciseNames(starter).map((n) => n.toLowerCase()));
    (programs as { addItem: unknown }).addItem = async () => null;
    await expect(createFromStarter(db, "coach-1", starter, programs)).rejects.toThrow("not_found_or_forbidden");
    expect(calls.some((c) => c.fn === "remove")).toBe(true);
  });
});
