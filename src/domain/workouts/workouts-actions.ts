"use server";

import { createClient } from "@/lib/supabase/server";
import { WorkoutsService, type LogSetInput } from "./workouts.service";

export async function startOrResumeSessionAction(programDayId: string) {
  const supabase = await createClient();
  const workouts = new WorkoutsService(supabase);

  const existing = await workouts.getSessionForDay(programDayId);
  if (existing && existing.completed_at == null) return existing;
  if (existing) return existing;

  return workouts.startSession(programDayId);
}

export async function logSetAction(sessionId: string, input: LogSetInput) {
  const supabase = await createClient();
  return new WorkoutsService(supabase).logSet(sessionId, input);
}

export async function listSetLogsAction(sessionId: string) {
  const supabase = await createClient();
  return new WorkoutsService(supabase).listSetLogs(sessionId);
}

export async function completeSessionAction(sessionId: string, durationSeconds: number) {
  const supabase = await createClient();
  return new WorkoutsService(supabase).completeSession(sessionId, durationSeconds);
}
