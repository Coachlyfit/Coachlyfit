import { describe, expect, it } from "vitest";
import { TasksService, type TaskInput } from "./tasks.service";

// Same hand-rolled style as team.service.test.ts: a .from(table) returning
// chainable stubs that record what was written. `affected` is how many rows
// a write "returned", i.e. whether RLS let it through.
function fakeSupabase(affected = 1) {
  const calls: { table: string; op: string; payload?: unknown; id?: string }[] = [];
  const rows = Array.from({ length: affected }, (_, i) => ({ id: `row-${i}` }));

  const db = {
    from(table: string) {
      return {
        insert: (payload: unknown) => {
          calls.push({ table, op: "insert", payload });
          const result = Promise.resolve({ data: rows[0] ?? null, error: null });
          return Object.assign(result, { select: () => ({ single: () => result }) });
        },
        update: (payload: unknown) => ({
          eq: (_column: string, id: string) => ({
            select: async () => {
              calls.push({ table, op: "update", payload, id });
              return { data: rows, error: null };
            },
          }),
        }),
        delete: () => ({
          eq: (_column: string, id: string) => ({
            select: async () => {
              calls.push({ table, op: "delete", id });
              return { data: rows, error: null };
            },
          }),
        }),
      };
    },
    rpc: async () => ({
      data: [
        { profile_id: "owner-1", display_name: "Coach", is_owner: true },
        { profile_id: "member-1", display_name: "Sara", is_owner: false },
      ],
      error: null,
    }),
  };

  return { db: db as never, calls };
}

const input: TaskInput = {
  title: "Call new leads",
  description: null,
  priority: "high",
  due_date: "2026-10-20",
  assignee_id: "member-1",
  client_id: null,
};

describe("TasksService", () => {
  it("create writes the task under the tenant", async () => {
    const { db, calls } = fakeSupabase();
    await new TasksService(db).create("coach-1", input);
    expect(calls).toEqual([{ table: "tasks", op: "insert", payload: { coach_id: "coach-1", ...input } }]);
  });

  it("setStatus sends only the status, leaving completed_at to the database", async () => {
    const { db, calls } = fakeSupabase();
    expect(await new TasksService(db).setStatus("task-1", "done")).toBe(true);
    expect(calls).toEqual([{ table: "tasks", op: "update", payload: { status: "done" }, id: "task-1" }]);
  });

  it("reports a write RLS filtered out as false rather than success", async () => {
    const { db } = fakeSupabase(0);
    const service = new TasksService(db);
    expect(await service.update("task-1", input)).toBe(false);
    expect(await service.setStatus("task-1", "done")).toBe(false);
    expect(await service.remove("task-1")).toBe(false);
  });

  it("addComment leaves the author to the column default", async () => {
    const { db, calls } = fakeSupabase();
    await new TasksService(db).addComment("task-1", "On it");
    expect(calls).toEqual([{ table: "task_comments", op: "insert", payload: { task_id: "task-1", body: "On it" } }]);
  });

  it("directory maps the RPC rows", async () => {
    const { db } = fakeSupabase();
    expect(await new TasksService(db).directory()).toEqual([
      { id: "owner-1", name: "Coach", isOwner: true },
      { id: "member-1", name: "Sara", isOwner: false },
    ]);
  });
});
