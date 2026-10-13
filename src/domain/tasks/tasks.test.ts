import { describe, expect, it } from "vitest";
import { isOverdue, matchesFilters, oneOf, TASK_STATUSES, type TaskFilters } from "./tasks";

const TODAY = "2026-10-13";
const ALL: TaskFilters = { status: "all", priority: "all", assignee: "all", due: "all" };
const task = (patch: Partial<Parameters<typeof matchesFilters>[0]> = {}) => ({
  status: "todo",
  priority: "medium",
  assigneeId: "member-1",
  dueDate: null,
  ...patch,
});

describe("isOverdue", () => {
  it("is true only for an open task whose due date has passed", () => {
    expect(isOverdue({ status: "todo", dueDate: "2026-10-12" }, TODAY)).toBe(true);
    expect(isOverdue({ status: "in_progress", dueDate: "2026-10-12" }, TODAY)).toBe(true);
    expect(isOverdue({ status: "todo", dueDate: TODAY }, TODAY)).toBe(false);
    expect(isOverdue({ status: "todo", dueDate: null }, TODAY)).toBe(false);
  });

  it("is never true for a finished or cancelled task", () => {
    expect(isOverdue({ status: "done", dueDate: "2026-01-01" }, TODAY)).toBe(false);
    expect(isOverdue({ status: "cancelled", dueDate: "2026-01-01" }, TODAY)).toBe(false);
  });
});

describe("matchesFilters", () => {
  it("passes everything with no filters set", () => {
    expect(matchesFilters(task(), ALL, TODAY)).toBe(true);
  });

  it("filters by status, priority and assignee", () => {
    expect(matchesFilters(task({ status: "done" }), { ...ALL, status: "todo" }, TODAY)).toBe(false);
    expect(matchesFilters(task({ priority: "high" }), { ...ALL, priority: "high" }, TODAY)).toBe(true);
    expect(matchesFilters(task(), { ...ALL, assignee: "member-2" }, TODAY)).toBe(false);
    expect(matchesFilters(task(), { ...ALL, assignee: "member-1" }, TODAY)).toBe(true);
  });

  it("'none' assignee means unassigned", () => {
    expect(matchesFilters(task({ assigneeId: null }), { ...ALL, assignee: "none" }, TODAY)).toBe(true);
    expect(matchesFilters(task(), { ...ALL, assignee: "none" }, TODAY)).toBe(false);
  });

  it("filters by due bucket", () => {
    const due = (dueDate: string | null, filter: TaskFilters["due"], status = "todo") =>
      matchesFilters(task({ dueDate, status }), { ...ALL, due: filter }, TODAY);

    expect(due("2026-10-12", "overdue")).toBe(true);
    expect(due("2026-10-12", "overdue", "done")).toBe(false);
    expect(due(TODAY, "today")).toBe(true);
    expect(due("2026-10-14", "today")).toBe(false);
    // week = today through today + 6, across a month boundary too.
    expect(due("2026-10-19", "week")).toBe(true);
    expect(due("2026-10-20", "week")).toBe(false);
    expect(due("2026-10-12", "week")).toBe(false);
    expect(matchesFilters(task({ dueDate: "2026-11-02" }), { ...ALL, due: "week" }, "2026-10-28")).toBe(true);
    expect(due(null, "none")).toBe(true);
    expect(due(TODAY, "none")).toBe(false);
  });
});

describe("oneOf", () => {
  it("keeps an allowed value and falls back on anything else", () => {
    expect(oneOf(TASK_STATUSES, "done", "todo")).toBe("done");
    expect(oneOf(TASK_STATUSES, "nope", "todo")).toBe("todo");
    expect(oneOf(TASK_STATUSES, undefined, "todo")).toBe("todo");
  });
});
