import { describe, expect, it } from "vitest";
import { ObservationsService } from "./observations.service";
import { observationImagePathOk, type ObservationFields } from "./observations";

type Call = { table?: string; op: string; args?: unknown };

/** Hand-rolled chain: every query method returns the chain, which resolves to
 * `result` when awaited; `maybeSingle`/`single` resolve too. */
function fakeSupabase(...results: { data: unknown }[]) {
  const calls: Call[] = [];
  let next = 0;
  function chain(table: string) {
    // One result per from() call, in order; the last one repeats.
    const res = { data: results[Math.min(next++, results.length - 1)].data, error: null };
    const c: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) => resolve(res),
    };
    for (const op of ["select", "insert", "update", "delete", "eq", "in", "order", "limit"]) {
      c[op] = (args?: unknown) => {
        calls.push({ table, op, args });
        return c;
      };
    }
    c.maybeSingle = () => Promise.resolve(res);
    c.single = () => Promise.resolve(res);
    return c;
  }
  const db = {
    from: (table: string) => chain(table),
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          calls.push({ op: "storage.remove", args: { bucket, paths } });
          return Promise.resolve({ data: [], error: null });
        },
      }),
    },
  };
  return { db: db as never, calls };
}

const fields: ObservationFields = {
  title: "Knee pain",
  category: "injury_pain",
  severity: "high",
  details: "",
  linked: { type: "program", id: "p1" },
  image_path: null,
};

describe("ObservationsService", () => {
  it("create maps fields to columns (empty details -> null)", async () => {
    const { db, calls } = fakeSupabase({ data: { id: "o1" } });
    await new ObservationsService(db).create("coach", "client", fields);
    expect(calls.find((c) => c.op === "insert")?.args).toEqual({
      coach_id: "coach",
      client_id: "client",
      title: "Knee pain",
      category: "injury_pain",
      severity: "high",
      details: null,
      linked_type: "program",
      linked_id: "p1",
      image_path: null,
    });
  });

  it("update returns false when the note is hidden / missing", async () => {
    const { db } = fakeSupabase({ data: null });
    expect(await new ObservationsService(db).update("o1", fields)).toBe(false);
  });

  it("update removes the old image when it was replaced", async () => {
    const { db, calls } = fakeSupabase({ data: { image_path: "c/k/old.webp" } }, { data: [{ id: "o1" }] });
    expect(await new ObservationsService(db).update("o1", { ...fields, image_path: "c/k/new.webp" })).toBe(true);
    expect(calls.find((c) => c.op === "storage.remove")?.args).toEqual({
      bucket: "observation-images",
      paths: ["c/k/old.webp"],
    });
  });

  it("update keeps the image object when the path is unchanged", async () => {
    const { db, calls } = fakeSupabase({ data: { image_path: "c/k/a.webp" } }, { data: [{ id: "o1" }] });
    await new ObservationsService(db).update("o1", { ...fields, image_path: "c/k/a.webp" });
    expect(calls.some((c) => c.op === "storage.remove")).toBe(false);
  });

  it("remove deletes the stored image of the removed note", async () => {
    const { db, calls } = fakeSupabase({ data: [{ id: "o1", image_path: "c/k/a.webp" }] });
    expect(await new ObservationsService(db).remove("o1")).toBe(true);
    expect(calls.find((c) => c.op === "storage.remove")?.args).toEqual({
      bucket: "observation-images",
      paths: ["c/k/a.webp"],
    });
  });

  it("remove returns false and touches no storage when nothing matched", async () => {
    const { db, calls } = fakeSupabase({ data: [] });
    expect(await new ObservationsService(db).remove("o1")).toBe(false);
    expect(calls.some((c) => c.op === "storage.remove")).toBe(false);
  });
});

describe("observationImagePathOk", () => {
  it("accepts coach/client-prefixed image paths only", () => {
    expect(observationImagePathOk("c/k/x.webp", "c", "k")).toBe(true);
    expect(observationImagePathOk("other/k/x.webp", "c", "k")).toBe(false);
    expect(observationImagePathOk("c/k/sub/x.webp", "c", "k")).toBe(false);
    expect(observationImagePathOk("c/k/x.exe", "c", "k")).toBe(false);
  });
});

describe("observationSchema", () => {
  const base = { title: "x", category: "general", severity: null, details: "", linked: null, image_path: null };

  it("requires a non-blank title and valid enums", async () => {
    const { observationSchema } = await import("@/app/[locale]/(coach)/clients/schemas");
    expect(observationSchema.safeParse(base).success).toBe(true);
    expect(observationSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    expect(observationSchema.safeParse({ ...base, category: "nope" }).success).toBe(false);
    expect(observationSchema.safeParse({ ...base, severity: "extreme" }).success).toBe(false);
    expect(observationSchema.safeParse({ ...base, linked: { type: "program", id: "not-a-uuid" } }).success).toBe(false);
  });
});
