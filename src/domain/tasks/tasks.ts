// Pure task rules shared by the server page, the client views and the
// service. Values match the check constraints in 20261020000002_tasks.sql.

export const TASK_STATUSES = ["todo", "in_progress", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const DUE_FILTERS = ["all", "overdue", "today", "week", "none"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export const TASK_VIEWS = ["list", "board"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export type TaskFilters = {
  status: TaskStatus | "all";
  priority: TaskPriority | "all";
  /** A profile id, or "none" for unassigned tasks. */
  assignee: string | "all" | "none";
  due: DueFilter;
};

type Filterable = {
  status: string;
  priority: string;
  assigneeId: string | null;
  /** "YYYY-MM-DD" */
  dueDate: string | null;
};

const OPEN: readonly string[] = ["todo", "in_progress"];

/** Past its due date and still open. A finished or cancelled task is never
 * overdue, whenever it was due. Dates are "YYYY-MM-DD", which compare
 * correctly as strings. */
export function isOverdue(task: Pick<Filterable, "status" | "dueDate">, today: string): boolean {
  return task.dueDate !== null && task.dueDate < today && OPEN.includes(task.status);
}

function addDays(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function matchesDue(task: Filterable, due: DueFilter, today: string): boolean {
  switch (due) {
    case "all":
      return true;
    case "none":
      return task.dueDate === null;
    case "overdue":
      return isOverdue(task, today);
    case "today":
      return task.dueDate === today;
    case "week":
      // The next 7 days including today; overdue has its own filter.
      return task.dueDate !== null && task.dueDate >= today && task.dueDate <= addDays(today, 6);
  }
}

export function matchesFilters(task: Filterable, filters: TaskFilters, today: string): boolean {
  if (filters.status !== "all" && task.status !== filters.status) return false;
  if (filters.priority !== "all" && task.priority !== filters.priority) return false;
  if (filters.assignee === "none" ? task.assigneeId !== null : filters.assignee !== "all" && task.assigneeId !== filters.assignee) {
    return false;
  }
  return matchesDue(task, filters.due, today);
}

/** Narrows a URL param to one of the allowed values; anything else (missing,
 * hand-edited) becomes the fallback instead of an error. */
export function oneOf<T extends string>(allowed: readonly T[], value: string | undefined, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
