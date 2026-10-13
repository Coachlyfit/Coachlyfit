import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/domain/tasks/tasks";

// "" is the form's "nothing picked" for the optional selects and the date;
// the action turns it into null.
const optionalId = z.string().uuid().or(z.literal(""));

export const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  priority: z.enum(TASK_PRIORITIES),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal("")),
  assignee_id: optionalId,
  client_id: optionalId,
});
export type TaskFormInput = z.infer<typeof taskSchema>;

export const taskStatusSchema = z.enum(TASK_STATUSES);

export const taskCommentSchema = z.string().trim().min(1).max(2000);
