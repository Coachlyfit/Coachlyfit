import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ProgramsService } from "../programs.service";
import { starterExerciseNames, type Starter } from "./index";

export type StarterResult = {
  programId: string;
  /** Exercise names the library did not have; those items were left out. */
  skipped: string[];
};

/** Turns a starter into an ordinary template program (client_id null) owned by
 * `coachId`: program, days, items with their per-set prescriptions, and the
 * superset / timed groups. Everything goes through ProgramsService, so the
 * parent-derivation and RLS rules are the same as a hand-built program.
 *
 * Exercises are resolved against the GLOBAL library by name_en
 * (case-insensitive, one query). A name that is not there is skipped and
 * reported instead of failing the plan. Like cloneTree there is no
 * transaction; a failure part-way removes the half-built program (best
 * effort) before rethrowing. */
export async function createFromStarter(
  db: SupabaseClient<Database>,
  coachId: string,
  starter: Starter,
  programs: Pick<
    ProgramsService,
    "create" | "addDay" | "addItem" | "reorderDays" | "reorderItems" | "groupItems" | "remove"
  > = new ProgramsService(db)
): Promise<StarterResult> {
  const names = starterExerciseNames(starter);
  // Names are plain words (checked by the starters test), so quoting them in
  // the or() filter is safe; ilike without wildcards is a case-insensitive "=".
  const { data: found, error } = await db
    .from("exercises")
    .select("id, name_en")
    .is("coach_id", null)
    .is("archived_at", null)
    .or(names.map((n) => `name_en.ilike."${n}"`).join(","));
  if (error) throw error;
  const idByName = new Map<string, string>();
  for (const e of found ?? []) {
    const key = e.name_en.toLowerCase();
    if (!idByName.has(key)) idByName.set(key, e.id);
  }

  const program = await programs.create(coachId, {
    client_id: null,
    name_ar: starter.name_ar,
    name_en: starter.name_en,
    schedule_mode: "cycle",
    plan_type: starter.plan_type,
    goal: starter.goal,
    level: starter.level,
    equipment: starter.equipment,
    week_plan: starter.week_plan ?? null,
  });

  const skipped = new Set<string>();
  try {
    const dayIds: string[] = [];
    for (const [dayIdx, day] of starter.days.entries()) {
      const created = await programs.addDay(program.id, {
        day_index: dayIdx + 1,
        label_ar: day.label_ar,
        label_en: day.label_en,
      });
      if (!created) throw new Error("not_found_or_forbidden");
      dayIds.push(created.id);

      const itemIds: string[] = [];
      const groupMembers = new Map<string, string[]>();
      for (const item of day.items) {
        const exerciseId = idByName.get(item.ex.toLowerCase());
        if (!exerciseId) {
          skipped.add(item.ex);
          continue;
        }
        const added = await programs.addItem(created.id, {
          exercise_id: exerciseId,
          sets: item.sets,
          block: item.block ?? "main",
          notes_en: item.notes_en,
          notes_ar: item.notes_ar,
        });
        if (!added) throw new Error("not_found_or_forbidden");
        itemIds.push(added.id);
        if (item.group) groupMembers.set(item.group, [...(groupMembers.get(item.group) ?? []), added.id]);
      }

      // order_index defaults to 0 on insert, so the day's order is written
      // explicitly — before grouping, which does not touch order.
      if (itemIds.length > 1) await programs.reorderItems(created.id, itemIds);
      for (const [key, ids] of groupMembers) {
        const format = day.groups?.[key];
        if (format && ids.length >= 2) await programs.groupItems(ids, format.kind, format.config ?? null);
      }
    }
    if (dayIds.length > 1) await programs.reorderDays(program.id, dayIds);
  } catch (err) {
    await programs.remove(program.id).catch(() => {});
    throw err;
  }

  return { programId: program.id, skipped: [...skipped] };
}
