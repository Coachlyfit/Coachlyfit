import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { TaskPriority, TaskStatus } from "./tasks";
import type { ProductivityCounts } from "./productivity";

const TASK_COLUMNS =
  "id, title, description, status, priority, due_date, assignee_id, client_id, created_by, completed_at, created_at, clients(display_name)";

// ponytail: the whole tenant's tasks in one read, filtered in the browser.
// Page it (and move the filters into the query) when a team outgrows this.
const LIST_LIMIT = 500;

export type TaskInput = {
  title: string;
  description: string | null;
  priority: TaskPriority;
  due_date: string | null;
  assignee_id: string | null;
  client_id: string | null;
};

/** Team tasks. Who may see or change what is decided in the database
 * (20261020000002_tasks.sql): the owner everything, a member only tasks
 * assigned to them and only their status. So these methods don't filter by
 * role -- a member's list() is already just their own tasks -- and a write
 * RLS refused comes back as `false`, not an error. */
export class TasksService {
  constructor(private db: SupabaseClient<Database>) {}

  async list() {
    const { data, error } = await this.db
      .from("tasks")
      .select(TASK_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
    if (error) throw error;
    return data;
  }

  /** Empty for a task the caller can't see: the comments policy follows the
   * task's own visibility. */
  async comments(taskId: string) {
    const { data, error } = await this.db
      .from("task_comments")
      .select("id, author_id, body, created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  }

  async create(coachId: string, input: TaskInput) {
    const { data, error } = await this.db
      .from("tasks")
      .insert({ coach_id: coachId, ...input })
      .select("id")
      .single();
    if (error) throw error;
    return data;
  }

  async update(id: string, input: TaskInput): Promise<boolean> {
    const { data, error } = await this.db.from("tasks").update(input).eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  /** The one change a team member may make. completed_at follows status in
   * private.tasks_guard(), never from here. */
  async setStatus(id: string, status: TaskStatus): Promise<boolean> {
    const { data, error } = await this.db.from("tasks").update({ status }).eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async remove(id: string): Promise<boolean> {
    const { data, error } = await this.db.from("tasks").delete().eq("id", id).select("id");
    if (error) throw error;
    return data.length > 0;
  }

  async addComment(taskId: string, body: string) {
    const { error } = await this.db.from("task_comments").insert({ task_id: taskId, body });
    if (error) throw error;
  }

  /** Display names for the owner and accepted members -- profiles is
   * self-read only, so names come from get_team_directory(). */
  async directory() {
    const { data, error } = await this.db.rpc("get_team_directory");
    if (error) throw error;
    return data.map((row) => ({ id: row.profile_id, name: row.display_name, isOwner: row.is_owner }));
  }

  /** Per-assignee counts for tasks assigned between two "YYYY-MM-DD" days,
   * inclusive. Rows only exist for people who were assigned something. */
  async productivity(from: string, to: string): Promise<(ProductivityCounts & { assigneeId: string })[]> {
    // ponytail: task_productivity isn't in the generated types until
    // 20261020000003 is applied and the types are regenerated. Drop the casts then.
    const { data, error } = await this.db.rpc("task_productivity" as never, { p_from: from, p_to: to } as never);
    if (error) throw error;
    const rows = (data ?? []) as {
      assignee_id: string;
      assigned: number;
      completed: number;
      completed_with_due: number;
      completed_on_time: number;
      overdue: number;
      avg_completion_seconds: number | null;
    }[];
    return rows.map((row) => ({
      assigneeId: row.assignee_id,
      assigned: row.assigned,
      completed: row.completed,
      completedWithDue: row.completed_with_due,
      completedOnTime: row.completed_on_time,
      overdue: row.overdue,
      avgCompletionSeconds: row.avg_completion_seconds,
    }));
  }
}
