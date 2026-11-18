export type DietDayKind = "training" | "rest" | "custom";

type DayLike = { id: string; kind: string; order_index: number };
type ScheduleLike = { weekday: number; diet_plan_day_id: string };

type Targets = {
  target_kcal: number | null;
  target_protein_g: number | null;
  target_carb_g: number | null;
  target_fat_g: number | null;
};

function byOrder<D extends DayLike>(days: D[]): D[] {
  return [...days].sort((a, b) => a.order_index - b.order_index);
}

/** The day a plan uses on `weekday` (0 = Sunday): the scheduled one, else the
 * first training day, else the first day. Null only for a plan with no days. */
export function resolveDietDay<D extends DayLike>(days: D[], schedule: ScheduleLike[], weekday: number): D | null {
  const ordered = byOrder(days);
  const mapped = schedule.find((s) => s.weekday === weekday);
  const scheduled = mapped && ordered.find((d) => d.id === mapped.diet_plan_day_id);
  return scheduled ?? ordered.find((d) => d.kind === "training") ?? ordered[0] ?? null;
}

/** A day's targets, each falling back to the plan's overall value when the
 * day leaves it unset. */
export function dayTargets(day: Targets | null, plan: Targets): Targets {
  return {
    target_kcal: day?.target_kcal ?? plan.target_kcal,
    target_protein_g: day?.target_protein_g ?? plan.target_protein_g,
    target_carb_g: day?.target_carb_g ?? plan.target_carb_g,
    target_fat_g: day?.target_fat_g ?? plan.target_fat_g,
  };
}
