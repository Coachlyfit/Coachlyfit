"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsService, type LogSetInput, type UpdateSetInput } from "./workouts.service";

const setFieldsSchema = {
  weight: z.coerce.number().min(0).max(999).multipleOf(0.25).optional().nullable(),
  reps: z.coerce.number().int().min(0).max(200).optional().nullable(),
  rpe: z.coerce.number().min(1).max(10).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
};

const logSetSchema = z.object({
  program_item_id: z.string().uuid(),
  set_index: z.coerce.number().int().min(0),
  substituted_exercise_id: z.string().uuid().optional().nullable(),
  ...setFieldsSchema,
});

const updateSetSchema = z.object(setFieldsSchema);

export async function startOrResumeSessionAction(programDayId: string) {
  const supabase = await createClient();
  const workouts = new WorkoutsService(supabase);

  const existing = await workouts.getSessionForDay(programDayId);
  if (existing && existing.completed_at == null) return existing;
  if (existing) return existing;

  return workouts.startSession(programDayId);
}

export async function logSetAction(
  sessionId: string,
  input: LogSetInput
): Promise<{ error: string } | { log: NonNullable<Awaited<ReturnType<WorkoutsService["logSet"]>>> }> {
  const parsed = logSetSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const log = await new WorkoutsService(supabase).logSet(sessionId, parsed.data);
  if (!log) return { error: "not_found_or_forbidden" };
  return { log };
}

export async function listSetLogsAction(sessionId: string) {
  const supabase = await createClient();
  return new WorkoutsService(supabase).listSetLogs(sessionId);
}

export async function updateSetAction(
  logId: string,
  input: UpdateSetInput
): Promise<{ error: string } | { log: NonNullable<Awaited<ReturnType<WorkoutsService["updateSet"]>>> }> {
  const parsed = updateSetSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const log = await new WorkoutsService(supabase).updateSet(logId, parsed.data);
  if (!log) return { error: "not_found_or_forbidden" };
  return { log };
}

export async function deleteSetAction(logId: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const ok = await new WorkoutsService(supabase).deleteSet(logId);
  if (!ok) return { error: "not_found_or_forbidden" };
  return { ok: true };
}

export async function completeSessionAction(sessionId: string, durationSeconds: number) {
  const supabase = await createClient();
  return new WorkoutsService(supabase).completeSession(sessionId, durationSeconds);
}
