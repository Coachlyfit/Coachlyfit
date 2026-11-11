import { describe, expect, it } from "vitest";
import { ImportsService } from "./imports.service";

type Err = { code?: string; hint?: string; message: string };

/** Records every write and answers the handful of read shapes the service
 * uses. No query semantics beyond that: filters are accepted and ignored. */
function fakeSupabase(opts: {
  clients?: { email: string | null; phone: string | null }[];
  exercises?: { name_ar: string; name_en: string }[];
  maxClients?: number | null;
  clientCount?: number;
  /** Error for the nth insert (0-based) into this table. */
  insertError?: { table: string; at: number; error: Err };
  undoRows?: number;
} = {}) {
  const writes: { table: string; op: string; payload?: unknown }[] = [];
  const insertsByTable: Record<string, number> = {};

  function builder(table: string) {
    let op = "select";
    let payload: unknown;
    let head = false;
    let range: [number, number] | null = null;
    const b = {
      select(_cols?: string, o?: { head?: boolean }) {
        head = !!o?.head;
        return b;
      },
      eq: () => b,
      neq: () => b,
      order: () => b,
      range(from: number, to: number) {
        range = [from, to];
        return b;
      },
      insert(p: unknown) {
        op = "insert";
        payload = p;
        return b;
      },
      update(p: unknown) {
        op = "update";
        payload = p;
        return b;
      },
      delete() {
        op = "delete";
        return b;
      },
      async single() {
        return { data: { id: "imp-1" }, error: null };
      },
      async maybeSingle() {
        if (table === "subscriptions")
          return { data: { subscription_tiers: { max_clients: opts.maxClients ?? null } }, error: null };
        if (table === "imports") return { data: { id: "imp-1", type: opts.exercises ? "exercises" : "clients" }, error: null };
        return { data: null, error: null };
      },
      then(resolve: (v: unknown) => void) {
        resolve(settle());
      },
    };

    function settle() {
      if (op === "insert") {
        const n = insertsByTable[table] ?? 0;
        insertsByTable[table] = n + 1;
        writes.push({ table, op, payload });
        const fail = opts.insertError;
        if (table !== "imports" && fail && fail.table === table && fail.at === n) return { error: fail.error };
        return { error: null };
      }
      if (op === "update" || op === "delete") {
        writes.push({ table, op, payload });
        return { data: Array.from({ length: opts.undoRows ?? 0 }, (_, i) => ({ id: String(i) })), error: null };
      }
      if (head) return { count: opts.clientCount ?? 0, error: null };
      const source = table === "clients" ? opts.clients : opts.exercises;
      const rows = source ?? [];
      return { data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null };
    }
    return b;
  }

  return { db: { from: builder } as never, writes };
}

const client = (n: number) => ({ displayName: `Client ${n}`, email: `c${n}@x.com`, phone: `0100000${String(n).padStart(4, "0")}` });
const inserts = (writes: ReturnType<typeof fakeSupabase>["writes"], table: string) =>
  writes.filter((w) => w.table === table && w.op === "insert");

describe("ImportsService.importClients", () => {
  it("sets coach_id and import_id on the server and inserts in chunks of 100", async () => {
    const { db, writes } = fakeSupabase();
    const rows = Array.from({ length: 250 }, (_, i) => client(i));

    const out = await new ImportsService(db).importClients("coach-1", rows);

    const chunks = inserts(writes, "clients").map((w) => w.payload as Record<string, unknown>[]);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunks[0][0]).toMatchObject({ coach_id: "coach-1", import_id: "imp-1", display_name: "Client 0" });
    expect(out).toMatchObject({ importId: "imp-1", imported: 250, skipped: 0, overLimit: 0, failed: 0 });
    // counts written back to the imports row
    expect(writes.find((w) => w.table === "imports" && w.op === "update")?.payload).toEqual({
      imported_count: 250,
      skipped_count: 0,
      failed_count: 0,
    });
  });

  it("skips duplicates of existing clients by email or phone digits", async () => {
    const { db, writes } = fakeSupabase({
      clients: [
        { email: "OLD@x.com", phone: null },
        { email: null, phone: "010 1111 2222" },
      ],
    });
    const out = await new ImportsService(db).importClients("coach-1", [
      { displayName: "Dup email", email: "old@x.com" },
      { displayName: "Dup phone", phone: "01011112222" },
      { displayName: "New", email: "new@x.com" },
    ]);
    expect(out).toMatchObject({ imported: 1, skipped: 2 });
    expect((inserts(writes, "clients")[0].payload as unknown[]).length).toBe(1);
  });

  it("imports up to the plan limit and reports the rest as overLimit", async () => {
    const { db, writes } = fakeSupabase({ maxClients: 10, clientCount: 7 });
    const out = await new ImportsService(db).importClients(
      "coach-1",
      Array.from({ length: 8 }, (_, i) => client(i))
    );
    expect(out).toMatchObject({ imported: 3, overLimit: 5, skipped: 5, failed: 0 });
    expect((inserts(writes, "clients")[0].payload as unknown[]).length).toBe(3);
  });

  it("at the limit already: no imports row is created at all", async () => {
    const { db, writes } = fakeSupabase({ maxClients: 10, clientCount: 10 });
    const out = await new ImportsService(db).importClients("coach-1", [client(1), client(2)]);
    expect(out).toMatchObject({ importId: null, imported: 0, overLimit: 2 });
    expect(inserts(writes, "imports")).toHaveLength(0);
  });

  it("a lapsed subscription stops after the first chunk and removes the empty imports row", async () => {
    const { db, writes } = fakeSupabase({
      insertError: { table: "clients", at: 0, error: { message: "x", hint: "subscription_inactive" } },
    });
    const out = await new ImportsService(db).importClients(
      "coach-1",
      Array.from({ length: 250 }, (_, i) => client(i))
    );
    expect(out).toMatchObject({ importId: null, imported: 0, failed: 250, stopped: "subscription_inactive" });
    expect(inserts(writes, "clients")).toHaveLength(1); // chunks 2 and 3 never attempted
    expect(writes.some((w) => w.table === "imports" && w.op === "delete")).toBe(true);
  });

  it("a failed middle chunk counts as failed but keeps the rest", async () => {
    const { db } = fakeSupabase({ insertError: { table: "clients", at: 1, error: { message: "x", code: "23514" } } });
    const out = await new ImportsService(db).importClients(
      "coach-1",
      Array.from({ length: 250 }, (_, i) => client(i))
    );
    expect(out).toMatchObject({ imported: 150, failed: 100, importId: "imp-1" });
  });
});

describe("ImportsService.importExercises", () => {
  it("dedupes by name against the coach's own library and stamps coach_id/import_id", async () => {
    const { db, writes } = fakeSupabase({ exercises: [{ name_ar: "بنش", name_en: "Bench Press" }] });
    const out = await new ImportsService(db).importExercises("coach-1", [
      { name_ar: "Bench press", name_en: "bench  press" }, // same as existing after normalizing
      { name_ar: "سكوات", name_en: "Squat", muscle_group: "legs" },
    ]);
    expect(out).toMatchObject({ imported: 1, skipped: 1 });
    expect((inserts(writes, "exercises")[0].payload as unknown[])[0]).toEqual({
      name_ar: "سكوات",
      name_en: "Squat",
      muscle_group: "legs",
      coach_id: "coach-1",
      import_id: "imp-1",
    });
  });

  it("a plan without custom_library (upgrade_required) imports nothing", async () => {
    const { db } = fakeSupabase({
      insertError: { table: "exercises", at: 0, error: { message: "x", hint: "upgrade_required" } },
    });
    const out = await new ImportsService(db).importExercises("coach-1", [{ name_ar: "a", name_en: "a" }]);
    expect(out).toMatchObject({ importId: null, imported: 0, stopped: "upgrade_required" });
  });
});

describe("ImportsService.undo", () => {
  it("deletes the tagged rows, then the import row, and returns how many rows went", async () => {
    const { db, writes } = fakeSupabase({ undoRows: 4 });
    expect(await new ImportsService(db).undo("imp-1")).toBe(4);
    expect(writes.map((w) => `${w.op}:${w.table}`)).toEqual(["delete:clients", "delete:imports"]);
  });
});
