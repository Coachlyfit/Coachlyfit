"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Check, Minus, Pause, Play, Plus } from "lucide-react";
import type { useRestTimer } from "@/hooks/use-rest-timer";
import { mmss } from "@/domain/workouts/session-runner";
import { cn } from "@/lib/utils";

function Stepper({
  label,
  value,
  onChange,
  onStep,
  step,
  inputMode,
  decreaseLabel,
  increaseLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onStep: (delta: number) => void;
  step: number;
  inputMode: "decimal" | "numeric";
  decreaseLabel: string;
  increaseLabel: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="truncate text-sm font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex h-14 items-center overflow-hidden rounded-xl border border-border bg-background">
        <button
          type="button"
          onClick={() => onStep(-step)}
          aria-label={decreaseLabel}
          className="flex h-full w-11 shrink-0 items-center justify-center text-foreground"
        >
          <Minus className="size-5" aria-hidden="true" />
        </button>
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-full min-w-0 flex-1 bg-transparent text-center font-mono text-2xl font-semibold tabular-nums text-foreground outline-none"
        />
        <button
          type="button"
          onClick={() => onStep(step)}
          aria-label={increaseLabel}
          className="flex h-full w-11 shrink-0 items-center justify-center text-foreground"
        >
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** One numeric input in the dock. Built by the runner from the exercise's
 * measurement type, so a plank gets a seconds stepper, a run gets distance +
 * time, a treadmill adds level/incline/speed. */
export type DockField = {
  key: string;
  label: string;
  value: string;
  step: number;
  inputMode: "decimal" | "numeric";
  /** Long-tail metric: tucked under "More" instead of the main row. */
  secondary: boolean;
};

export function SessionDock({
  rest,
  upNext,
  state,
  fields,
  onFieldChange,
  onFieldStep,
  completeLabel,
  onComplete,
  onContinue,
  onFinish,
  finishing,
}: {
  rest: ReturnType<typeof useRestTimer>;
  upNext: string | null;
  /** log: current exercise has an open set; exerciseComplete: it doesn't
   * but others do; allDone: every set in the workout is logged. */
  state: "log" | "exerciseComplete" | "allDone";
  fields: DockField[];
  onFieldChange: (key: string, value: string) => void;
  onFieldStep: (key: string, delta: number) => void;
  completeLabel: string;
  onComplete: () => void;
  onContinue: () => void;
  onFinish: () => void;
  finishing: boolean;
}) {
  const t = useTranslations("client.workout");
  const tm = useTranslations("measure");
  const pct = rest.duration > 0 ? Math.min(100, (rest.remaining / rest.duration) * 100) : 0;
  // A type made only of long-tail metrics (intervals, laps/steps) has nothing
  // "main" to show, so everything is primary in that case.
  const primary = fields.some((f) => !f.secondary) ? fields.filter((f) => !f.secondary) : fields;
  const secondary = primary === fields ? [] : fields.filter((f) => f.secondary);
  const renderStepper = (f: DockField) => (
    <Stepper
      key={f.key}
      label={f.label}
      value={f.value}
      onChange={(value) => onFieldChange(f.key, value)}
      onStep={(delta) => onFieldStep(f.key, delta)}
      step={f.step}
      inputMode={f.inputMode}
      decreaseLabel={tm("decrease", { field: f.label })}
      increaseLabel={tm("increase", { field: f.label })}
    />
  );

  return (
    <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-card px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {rest.isResting && (
        <div
          role="timer"
          aria-label={t("rest")}
          className="flex flex-col gap-2 rounded-2xl bg-foreground py-2.5 ps-3.5 pe-2.5 text-background"
        >
          <div className="flex items-center gap-1.5">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm">{rest.paused ? t("restPaused") : t("rest")}</span>
              <span className="font-mono text-[28px] leading-9 font-semibold tabular-nums">{mmss(rest.remaining)}</span>
            </div>
            <button
              type="button"
              onClick={rest.paused ? rest.resume : rest.pause}
              aria-label={rest.paused ? t("resumeRest") : t("pauseRest")}
              className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-background/15"
            >
              {rest.paused ? (
                <Play className="size-4.5 fill-current" aria-hidden="true" />
              ) : (
                <Pause className="size-4.5 fill-current" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => rest.adjust(15)}
              aria-label={t("restPlus15")}
              className="flex h-11 shrink-0 items-center justify-center rounded-[10px] bg-background/15 px-2.5 font-mono text-[15px] font-semibold"
            >
              +15
            </button>
            <button
              type="button"
              onClick={rest.skip}
              className="flex h-11 shrink-0 items-center justify-center rounded-[10px] bg-primary px-3.5 text-[15px] font-semibold text-primary-foreground"
            >
              {t("skipRest")}
            </button>
          </div>
          <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-background/15">
            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          {upNext && <p className="truncate text-sm">{upNext}</p>}
        </div>
      )}

      {state === "log" && (
        <>
          <div className={cn("grid gap-2.5", primary.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {primary.map(renderStepper)}
          </div>
          {secondary.length > 0 && (
            <details className="group rounded-xl bg-muted/40">
              <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium text-muted-foreground outline-none [&::-webkit-details-marker]:hidden">
                {tm("more")}
              </summary>
              <div className="grid grid-cols-2 gap-2.5 px-3 pb-3">{secondary.map(renderStepper)}</div>
            </details>
          )}
          <button
            type="button"
            onClick={onComplete}
            className="flex h-14 items-center justify-center gap-2.5 rounded-xl bg-primary text-[17px] font-semibold text-primary-foreground"
          >
            <Check className="size-5.5" strokeWidth={2.5} aria-hidden="true" />
            <span className="truncate">{completeLabel}</span>
          </button>
        </>
      )}

      {state !== "log" && (
        <button
          type="button"
          onClick={state === "allDone" ? onFinish : onContinue}
          disabled={finishing}
          className={cn(
            "h-14 truncate rounded-xl px-4 text-[17px] font-semibold disabled:opacity-60",
            state === "allDone" ? "bg-primary text-primary-foreground" : "bg-foreground text-background"
          )}
        >
          {state === "allDone" ? t("finish") : t("exerciseComplete")}
        </button>
      )}
    </div>
  );
}
