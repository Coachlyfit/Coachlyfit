"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { WorkoutsService, type LogSetInput, type UpdateSetInput, type ExerciseResultInput } from "./workouts.service";
import { ActivityLogsService, type LogActivityInput } from "./activity-logs.service";
import { startOfWeekSaturday } from "@/domain/programs/program-cycle";

// Numeric extra metrics a set can carry (EXTRA_KEYS in library/measurement.ts)
// plus the two per-set tags. Anything else in the object is rejected, so a
// client can't use `extra` as free-form storage.
const extraSchema = z
  .object({
    rounds: z.number().int().min(1).max(100),
    work_s: z.number().int().min(1).max(3600),
    rest_s: z.number().int().min(0).max(3600),
    level: z.number().min(0).max(100),
    incline: z.number().min(-10).max(100),
    speed: z.number().min(0).max(100),
    laps: z.number().int().min(1).max(1000),
    steps: z.number().int().min(1).max(200_000),
    side: z.enum(["left", "right"]),
    set_type: z.enum(["warmup", "drop", "failure"]),
  })
  .partial()
  .strict();

const setFieldsSchema = {
  // Negative = assisted bodyweight (stored as -assistance, see measurement.ts).
  weight: z.coerce.number().min(-999).max(999).multipleOf(0.25).optional().nullable(),
  reps: z.coerce.number().int().min(0).max(1000).optional().nullable(),
  // Hold/work time. Without it here zod stripped it and it was never saved.
  duration_seconds: z.coerce.number().int().min(1).max(86_400).optional().nullable(),
  distance_m: z.coerce.number().min(1).max(1_000_000).optional().nullable(),
  calories: z.coerce.number().int().min(1).max(10_000).optional().nullable(),
  rir: z.coerce.number().int().min(0).max(10).optional().nullable(),
  extra: extraSchema.optional().nullable(),
  rpe: z.coerce.number().min(1).max(10).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
};

const logSetSchema = z.object({
  id: z.string().uuid().optional(),
  client_logged_at: z.string().datetime({ offset: true }).optional(),
  program_item_id: z.string().uuid(),
  set_index: z.coerce.number().int().min(0),
  substituted_exercise_id: z.string().uuid().optional().nullable(),
  ...setFieldsSchema,
});

const updateSetSchema = z.object(setFieldsSchema);

const activityLogSchema = z.object({
  performed_on: z.string().optional(),
  duration_min: z.coerce.number().int().min(1).max(600).optional().nullable(),
  distance_km: z.coerce.number().min(0.01).max(500).optional().nullable(),
  avg_hr: z.coerce.number().int().min(1).max(250).optional().nullable(),
  kcal: z.coerce.number().int().min(1).max(5000).optional().nullable(),
  rpe: z.coerce.number().int().min(1).max(10).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const exerciseResultSchema = z.object({
  status: z.enum(["done", "skipped"]),
  difficulty: z.coerce.number().int().min(1).max(5).optional().nullable(),
  pain: z.coerce.number().int().min(0).max(5).optional().nullable(),
  energy: z.coerce.number().int().min(1).max(5).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function startOrResumeSessionAction(programDayId: string) {
  const supabase = await createClient();
  const workouts = new WorkoutsService(supabase);

  const weekStart = startOfWeekSaturday(new Date().toISOString().slice(0, 10));
  const existing = await workouts.getSessionForDay(programDayId, weekStart);
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

export async function listExerciseResultsAction(sessionId: string) {
  const supabase = await createClient();
  return new WorkoutsService(supabase).listExerciseResults(sessionId);
}

export async function getLastPerformanceAction(exerciseIds: string[], excludeSessionId?: string) {
  const supabase = await createClient();
  const map = await new WorkoutsService(supabase).getLastPerformance(exerciseIds, excludeSessionId);
  // Server actions can't return a Map across the RSC boundary — plain
  // object keyed by exercise_id, same information.
  return Object.fromEntries(map);
}

// The 7-day immutability trigger (private.reject_stale_client_edit,
// 20260907000001_client_data_immutability.sql) raises with SQLSTATE 42501
// ("insufficient privilege") -- caught here and turned into a typed error
// key instead of an unhandled exception bubbling out of the server action
// as a generic digest error.
const STALE_EDIT_ERRCODE = "42501";

function isStaleEditError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === STALE_EDIT_ERRCODE;
}

export async function updateSetAction(
  logId: string,
  input: UpdateSetInput
): Promise<{ error: string } | { log: NonNullable<Awaited<ReturnType<WorkoutsService["updateSet"]>>> }> {
  const parsed = updateSetSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  try {
    const log = await new WorkoutsService(supabase).updateSet(logId, parsed.data);
    if (!log) return { error: "not_found_or_forbidden" };
    return { log };
  } catch (err) {
    if (isStaleEditError(err)) return { error: "entry_locked" };
    throw err;
  }
}

export async function deleteSetAction(logId: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  try {
    const ok = await new WorkoutsService(supabase).deleteSet(logId);
    if (!ok) return { error: "not_found_or_forbidden" };
    return { ok: true };
  } catch (err) {
    if (isStaleEditError(err)) return { error: "entry_locked" };
    throw err;
  }
}

export async function setExerciseResultAction(
  sessionId: string,
  programItemId: string,
  input: ExerciseResultInput
): Promise<{ error: string } | { ok: true }> {
  const parsed = exerciseResultSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const result = await new WorkoutsService(supabase).setExerciseResult(sessionId, programItemId, parsed.data);
  if (!result) return { error: "not_found_or_forbidden" };
  return { ok: true };
}

export async function saveSessionProgressAction(sessionId: string, elapsedSeconds: number, currentItemId: string | null) {
  const supabase = await createClient();
  await new WorkoutsService(supabase).saveSessionProgress(sessionId, elapsedSeconds, currentItemId);
}

export async function completeSessionAction(sessionId: string, durationSeconds: number) {
  const supabase = await createClient();
  return new WorkoutsService(supabase).completeSession(sessionId, durationSeconds);
}

// One replayable write from the offline outbox (src/lib/offline). Every kind
// is idempotent server-side: set_upsert hits the (session,item,set) unique
// key, set_delete matches zero rows on replay, exercise_result upserts on
// (session,item), session_complete recomputes its summary.
const outboxOpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("set_upsert"), sessionId: z.string().uuid(), input: logSetSchema }),
  z.object({
    kind: z.literal("set_delete"),
    sessionId: z.string().uuid(),
    programItemId: z.string().uuid(),
    setIndex: z.coerce.number().int().min(0),
  }),
  z.object({
    kind: z.literal("exercise_result"),
    sessionId: z.string().uuid(),
    programItemId: z.string().uuid(),
    input: exerciseResultSchema,
  }),
  z.object({
    kind: z.literal("session_complete"),
    sessionId: z.string().uuid(),
    durationSeconds: z.coerce.number().int().min(0).max(86_400),
  }),
]);

export type OutboxOpInput = z.input<typeof outboxOpSchema>;

/** `unauthenticated` means "keep it queued and retry after re-auth" — the
 * sync engine must not count it as a failed attempt. */
export async function syncOutboxOpAction(op: OutboxOpInput): Promise<{ error: string } | { ok: true }> {
  const parsed = outboxOpSchema.safeParse(op);
  if (!parsed.success) return { error: "invalid_input" };
  const o = parsed.data;

  const supabase = await createClient();
  // With an expired token RLS would answer "no rows", which is
  // indistinguishable from "not yours" — check the session first.
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "unauthenticated" };

  const workouts = new WorkoutsService(supabase);
  try {
    switch (o.kind) {
      case "set_upsert":
        return (await workouts.logSet(o.sessionId, o.input)) ? { ok: true } : { error: "not_found_or_forbidden" };
      case "set_delete":
        await workouts.deleteSetByKey(o.sessionId, o.programItemId, o.setIndex);
        return { ok: true };
      case "exercise_result":
        return (await workouts.setExerciseResult(o.sessionId, o.programItemId, o.input))
          ? { ok: true }
          : { error: "not_found_or_forbidden" };
      case "session_complete":
        await workouts.completeSession(o.sessionId, o.durationSeconds);
        return { ok: true };
    }
  } catch (err) {
    if (isStaleEditError(err)) return { error: "entry_locked" };
    throw err;
  }
}

export async function logActivityAction(
  activityId: string,
  input: LogActivityInput
): Promise<{ error: string } | { ok: true }> {
  const parsed = activityLogSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  try {
    const result = await new ActivityLogsService(supabase).logActivity(activityId, parsed.data);
    if (!result) return { error: "not_found_or_forbidden" };
    return { ok: true };
  } catch (err) {
    if (isStaleEditError(err)) return { error: "entry_locked" };
    throw err;
  }
}
