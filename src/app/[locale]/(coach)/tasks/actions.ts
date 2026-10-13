"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/auth/require-coach";
import { getFeatures } from "@/lib/features";
import { TasksService } from "@/domain/tasks/tasks.service";
import { taskCommentSchema, taskSchema, taskStatusSchema, type TaskFormInput } from "./schemas";

type ActionResult = { error: string } | void;

export type TaskComment = { id: string; authorId: string | null; body: string; createdAt: string };

// Signed in as a coach or team member, on a plan with task management. The
// policies and triggers on tasks (20261020000002) are the boundary -- owner
// vs member, tenant isolation, the plan flag; this only answers early with a
// code the UI can show instead of a bare database refusal.
async function requireTasks() {
  const coach = await requireCoach();
  if ("error" in coach) return coach;
  if (!(await getFeatures()).task_management) return { error: "upgrade_required" as const };
  return coach;
}

function taskError(error: unknown): string {
  const { hint, code } = (error ?? {}) as { hint?: string; code?: string };
  if (hint === "upgrade_required" || hint === "invalid_assignee" || hint === "invalid_client") return hint;
  // RLS refused the row, or tasks_guard refused a member editing more than status.
  if (code === "42501") return "not_found_or_forbidden";
  return "unknown";
}

function toInput(data: TaskFormInput) {
  return {
    title: data.title,
    description: data.description || null,
    priority: data.priority,
    due_date: data.due_date || null,
    assignee_id: data.assignee_id || null,
    client_id: data.client_id || null,
  };
}

export async function createTaskAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const coach = await requireTasks();
  if ("error" in coach) return { error: coach.error };

  try {
    await new TasksService(coach.supabase).create(coach.coachId, toInput(parsed.data));
  } catch (error) {
    return { error: taskError(error) };
  }
  revalidatePath(`/${locale}/tasks`);
}

export async function updateTaskAction(locale: string, id: string, input: unknown): Promise<ActionResult> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const coach = await requireTasks();
  if ("error" in coach) return { error: coach.error };

  try {
    const ok = await new TasksService(coach.supabase).update(id, toInput(parsed.data));
    if (!ok) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: taskError(error) };
  }
  revalidatePath(`/${locale}/tasks`);
}

export async function setTaskStatusAction(locale: string, id: string, status: string): Promise<ActionResult> {
  const parsed = taskStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "invalid_input" };

  const coach = await requireTasks();
  if ("error" in coach) return { error: coach.error };

  try {
    const ok = await new TasksService(coach.supabase).setStatus(id, parsed.data);
    if (!ok) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: taskError(error) };
  }
  revalidatePath(`/${locale}/tasks`);
}

export async function deleteTaskAction(locale: string, id: string): Promise<ActionResult> {
  const coach = await requireTasks();
  if ("error" in coach) return { error: coach.error };

  try {
    const ok = await new TasksService(coach.supabase).remove(id);
    if (!ok) return { error: "not_found_or_forbidden" };
  } catch (error) {
    return { error: taskError(error) };
  }
  revalidatePath(`/${locale}/tasks`);
}

/** Loaded when the detail drawer opens, not with the list. */
export async function listTaskCommentsAction(taskId: string): Promise<TaskComment[]> {
  const coach = await requireTasks();
  if ("error" in coach) return [];

  const rows = await new TasksService(coach.supabase).comments(taskId);
  return rows.map((row) => ({ id: row.id, authorId: row.author_id, body: row.body, createdAt: row.created_at }));
}

export async function addTaskCommentAction(taskId: string, body: string): Promise<ActionResult> {
  const parsed = taskCommentSchema.safeParse(body);
  if (!parsed.success) return { error: "invalid_input" };

  const coach = await requireTasks();
  if ("error" in coach) return { error: coach.error };

  try {
    await new TasksService(coach.supabase).addComment(taskId, parsed.data);
  } catch (error) {
    return { error: taskError(error) };
  }
}
