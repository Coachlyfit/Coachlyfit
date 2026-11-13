"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MAX_PROGRAM_WEEKS } from "@/domain/programs/progression";
import { FIRST_PLAN_WEEK, isDeloadWeek, type WeekPlan } from "@/domain/programs/week-plan";
import { setWeekPlanAction } from "../actions";
import { useRouter } from "@/i18n/navigation";

type Row = { label: string; load: string; reps: string; deload: boolean };

const WEEKS = Array.from({ length: MAX_PROGRAM_WEEKS - FIRST_PLAN_WEEK + 1 }, (_, i) => i + FIRST_PLAN_WEEK);

/** The rows the dialog opens with: the stored plan, or — with none — the
 * default behaviour spelled out (a deload on every 4th week) so saving without
 * touching anything changes nothing. */
function rowsFrom(plan: WeekPlan | null): Record<number, Row> {
  const rows: Record<number, Row> = {};
  for (const week of WEEKS) {
    const m = plan?.[String(week)];
    rows[week] = {
      label: m?.label ?? "",
      load: m?.load_pct != null ? String(m.load_pct) : "",
      reps: m?.reps_delta ? String(m.reps_delta) : "",
      deload: isDeloadWeek(plan, week),
    };
  }
  return rows;
}

/** Rows -> the plan to store. Returns null when the rows are exactly the
 * default (nothing authored, deload on weeks 4/8/12), and a marker entry when
 * the coach deliberately removed every deload — an empty plan would otherwise
 * read as "use the default". */
function planFrom(rows: Record<number, Row>): WeekPlan | null {
  const plan: WeekPlan = {};
  for (const week of WEEKS) {
    const r = rows[week];
    const mod: NonNullable<WeekPlan[string]> = {};
    if (r.label.trim()) mod.label = r.label.trim();
    const load = Number(r.load);
    if (r.load.trim() && Number.isFinite(load) && load !== 100) mod.load_pct = Math.round(load);
    const reps = Number(r.reps);
    if (r.reps.trim() && Number.isFinite(reps) && reps !== 0) mod.reps_delta = Math.round(reps);
    if (r.deload) mod.deload = true;
    if (Object.keys(mod).length > 0) plan[String(week)] = mod;
  }
  const isDefault = WEEKS.every((w) => rows[w].deload === (w % 4 === 0));
  if (Object.keys(plan).length === 0) return isDefault ? null : { [String(FIRST_PLAN_WEEK)]: { reps_delta: 0 } };
  return plan;
}

/** Authors the program's periodization: per week a name, a load % and a rep
 * delta applied on top of the progression rule, and whether it is a deload. */
export function WeekPlanDialog({
  locale,
  programId,
  plan,
}: {
  locale: string;
  programId: string;
  plan: WeekPlan | null;
}) {
  const t = useTranslations("programs.weekPlan");
  const tErrors = useTranslations("programs.errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(() => rowsFrom(plan));
  const [pending, startTransition] = useTransition();

  const set = (week: number, patch: Partial<Row>) => setRows((r) => ({ ...r, [week]: { ...r[week], ...patch } }));

  function fillMesocycle() {
    const next: Record<number, Row> = {};
    for (const week of WEEKS) {
      const deload = week % 4 === 0;
      next[week] = { label: deload ? t("deload") : t("build"), load: deload ? "60" : "", reps: "", deload };
    }
    setRows(next);
  }

  function save(reset: boolean) {
    startTransition(async () => {
      const result = await setWeekPlanAction(locale, programId, reset ? null : planFrom(rows));
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      if (reset) setRows(rowsFrom(null));
      setOpen(false);
      toast.success(t("saved"));
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setRows(rowsFrom(plan));
          setOpen(true);
        }}
      >
        <CalendarRange className="size-4" aria-hidden="true" />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto rounded-xl border border-border">
            <div className="min-w-[34rem]">
              <div className="grid grid-cols-[4.5rem_minmax(0,1.6fr)_5.5rem_5.5rem_4.5rem] items-center gap-2 bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <span>{t("week")}</span>
                <span>{t("name")}</span>
                <span>{t("loadPct")}</span>
                <span>{t("repsDelta")}</span>
                <span>{t("deloadShort")}</span>
              </div>
              {WEEKS.map((week) => (
                <div
                  key={week}
                  className="grid grid-cols-[4.5rem_minmax(0,1.6fr)_5.5rem_5.5rem_4.5rem] items-center gap-2 border-t border-border px-3 py-2"
                >
                  <span className="font-mono text-sm tabular-nums">{t("weekN", { n: week })}</span>
                  <Input
                    maxLength={40}
                    value={rows[week].label}
                    aria-label={`${t("name")} · ${t("weekN", { n: week })}`}
                    onChange={(e) => set(week, { label: e.target.value })}
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={40}
                    max={150}
                    placeholder="100"
                    value={rows[week].load}
                    aria-label={`${t("loadPct")} · ${t("weekN", { n: week })}`}
                    onChange={(e) => set(week, { load: e.target.value })}
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={-10}
                    max={10}
                    placeholder="0"
                    value={rows[week].reps}
                    aria-label={`${t("repsDelta")} · ${t("weekN", { n: week })}`}
                    onChange={(e) => set(week, { reps: e.target.value })}
                  />
                  <input
                    type="checkbox"
                    className="size-4 justify-self-center accent-primary"
                    checked={rows[week].deload}
                    aria-label={`${t("deload")} · ${t("weekN", { n: week })}`}
                    onChange={(e) => set(week, { deload: e.target.checked })}
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <div className="flex gap-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={fillMesocycle}>
                {t("fillMesocycle")}
              </Button>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => save(true)}>
                {t("reset")}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" disabled={pending} onClick={() => save(false)} className="min-w-24">
                {pending ? tCommon("pending") : tCommon("save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
