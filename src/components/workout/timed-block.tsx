"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Pencil, Play, Plus, Square } from "lucide-react";
import { useStopwatch } from "@/hooks/use-stopwatch";
import { cn } from "@/lib/utils";
import { formatGroupConfig, type GroupConfig, type TimedGroupKind } from "@/domain/programs/group-config";
import type { BlockResult } from "@/domain/workouts/block-result";
import { buildSchedule, formatClock, snapshotAt, splitsFromMarks, stopwatchSnapshot } from "@/domain/workouts/interval-timer";

export type TimedBlockMember = { id: string; name: string; target: string };

/** "5 rounds + 3 reps", "7:42", "8 rounds" — plus Rx/Scaled and the cap flag.
 * Shared by the saved-result card and the session summary. */
export function useBlockResultText() {
  const t = useTranslations("client.workout.timed");
  return (r: BlockResult): string => {
    const parts: string[] = [];
    if (r.kind === "for_time") {
      if (r.time_s != null) parts.push(formatClock(r.time_s));
      if (r.time_cap_hit) parts.push(t("capHit"));
    } else if (r.rounds != null) {
      parts.push(
        r.extra_reps ? t("roundsAndReps", { rounds: r.rounds, reps: r.extra_reps }) : t("roundsCount", { count: r.rounds })
      );
    }
    if (r.rx != null) parts.push(r.rx ? t("rx") : t("scaled"));
    return parts.join(" · ");
  };
}

type Draft = { rounds: string; reps: string; min: string; sec: string; rx: boolean; capHit: boolean };
const EMPTY_DRAFT: Draft = { rounds: "", reps: "", min: "", sec: "", rx: true, capHit: false };

/** The runner's view of one timed group (AMRAP / EMOM / For Time / Tabata):
 * the exercise list, a wall-clock timer, a round counter, split capture for
 * For Time, and a score entry that becomes the group's BlockResult. The
 * parent owns persistence (offline outbox); this component only produces the
 * result. */
export function TimedBlock({
  kind,
  config,
  members,
  result,
  onSave,
  onOpenExercise,
}: {
  kind: TimedGroupKind;
  config: GroupConfig;
  members: TimedBlockMember[];
  result: BlockResult | undefined;
  onSave: (result: BlockResult) => void;
  onOpenExercise: (memberId: string) => void;
}) {
  const t = useTranslations("client.workout.timed");
  const tKinds = useTranslations("programs.builder.groupFormat.kinds");
  const text = useBlockResultText();
  const watch = useStopwatch();
  const [mode, setMode] = useState<"ready" | "running" | "score">("ready");
  // Rounds counted by tapping (AMRAP / For Time); EMOM and Tabata derive theirs.
  const [counted, setCounted] = useState(0);
  const [marks, setMarks] = useState<number[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const schedule = buildSchedule(kind, config);
  const snap = schedule ? snapshotAt(schedule, watch.elapsedMs) : null;
  const sw = stopwatchSnapshot(watch.elapsedMs, config.time_cap_s);
  const finishedByClock = mode === "running" && (snap ? snap.done : sw.capped);

  function begin() {
    setCounted(0);
    setMarks([]);
    watch.reset();
    watch.start();
    setMode("running");
  }

  function finish(early: boolean, roundsOverride?: number) {
    const ms = watch.stop();
    const elapsedS = Math.round(ms / 1000);
    let rounds = roundsOverride ?? counted;
    if (kind === "emom" || kind === "tabata") {
      const total = config.rounds ?? 0;
      // A round counts once its work interval has run out; stopping mid-round
      // does not complete it.
      rounds =
        early && snap && !snap.done
          ? Math.max(0, (snap.phase?.round ?? 1) - 1 + (snap.phase?.kind === "rest" ? 1 : 0))
          : total;
    }
    const time = kind === "for_time" ? Math.min(elapsedS, config.time_cap_s ?? elapsedS) : elapsedS;
    setDraft({
      rounds: String(rounds),
      reps: "",
      min: String(Math.floor(time / 60)),
      sec: String(time % 60),
      rx: true,
      capHit: kind === "for_time" && !!config.time_cap_s && elapsedS >= config.time_cap_s,
    });
    setMode("score");
  }

  // The clock ran out (AMRAP / EMOM / Tabata) or the For Time cap was reached.
  // Checked from a timer callback (an external subscription) rather than from
  // an effect body, with a ref so the callback always sees the latest render.
  const latest = useRef({ finishedByClock, finish });
  useEffect(() => {
    latest.current = { finishedByClock, finish };
  });
  useEffect(() => {
    if (mode !== "running") return;
    const id = setInterval(() => {
      if (latest.current.finishedByClock) latest.current.finish(false);
    }, 250);
    return () => clearInterval(id);
  }, [mode]);

  // Buzz on every phase change (EMOM interval, Tabata work/rest).
  const lastPhase = useRef(0);
  const phaseIndex = snap?.phaseIndex ?? 0;
  const snapDone = snap?.done ?? false;
  useEffect(() => {
    if (mode !== "running" || !schedule) return;
    if (phaseIndex !== lastPhase.current) {
      lastPhase.current = phaseIndex;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(snapDone ? [300, 100, 300] : 150);
    }
    // schedule is rebuilt each render from stable config; phaseIndex is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phaseIndex, snapDone]);

  function roundDone() {
    const nextCount = counted + 1;
    setCounted(nextCount);
    if (kind !== "for_time") return;
    const next = [...marks, Math.round(watch.elapsedMs / 1000)];
    setMarks(next);
    // All rounds done: stop the clock and go straight to the score.
    if (config.rounds && next.length >= config.rounds) finish(false, nextCount);
  }

  function save() {
    const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
    const out: BlockResult = { kind, rx: draft.rx, rounds: num(draft.rounds) };
    if (kind === "for_time") {
      out.time_s = num(draft.min) * 60 + num(draft.sec);
      if (marks.length > 0) out.splits_s = splitsFromMarks(marks);
      if (draft.capHit) out.time_cap_hit = true;
    } else if (kind === "amrap") {
      out.extra_reps = num(draft.reps);
    }
    onSave(out);
    setMode("ready");
  }

  function edit() {
    if (!result) return;
    const time = result.time_s ?? 0;
    setDraft({
      rounds: String(result.rounds ?? ""),
      reps: String(result.extra_reps ?? ""),
      min: String(Math.floor(time / 60)),
      sec: String(time % 60),
      rx: result.rx ?? true,
      capHit: !!result.time_cap_hit,
    });
    setMarks([]);
    setMode("score");
  }

  const detail = formatGroupConfig(kind, config);
  const header = (
    <div className="flex flex-col gap-1">
      <span className="w-fit rounded-md bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
        {tKinds(kind)}
        {detail ? ` · ${detail}` : ""}
      </span>
      <p className="text-sm text-muted-foreground">{t(`hint.${kind}`)}</p>
    </div>
  );

  const list = (
    <ul className="flex flex-col gap-2">
      {members.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onOpenExercise(m.id)}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 text-start"
          >
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{m.name}</span>
            <span className="shrink-0 font-mono text-sm text-muted-foreground tabular-nums">{m.target}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  const bigButton = "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold";

  if (mode === "running") {
    const isRest = snap?.phase?.kind === "rest";
    const big = snap
      ? formatClock(kind === "amrap" ? snap.totalS - snap.elapsedS : snap.remainingS)
      : formatClock(sw.elapsedS);
    const roundLine =
      kind === "emom" || kind === "tabata"
        ? t("roundOf", { round: snap?.phase?.round ?? config.rounds ?? 0, total: config.rounds ?? 0 })
        : t("roundsCount", { count: counted });
    const subLine =
      kind === "for_time" && config.time_cap_s
        ? t("capLeft", { time: formatClock(Math.max(0, config.time_cap_s - sw.elapsedS)) })
        : kind === "amrap"
          ? t("elapsedOf", { elapsed: formatClock(sw.elapsedS) })
          : "";
    return (
      <section className="flex flex-col gap-4">
        {header}
        <div
          className={cn(
            "flex flex-col items-center gap-1 rounded-3xl border-2 py-8",
            isRest ? "border-border bg-muted" : "border-primary bg-card"
          )}
        >
          {(kind === "tabata" || kind === "emom") && snap?.phase && (
            <span className="text-sm font-semibold text-muted-foreground">{isRest ? t("rest") : t("work")}</span>
          )}
          <span role="timer" className="font-mono text-6xl font-bold tabular-nums">
            {big}
          </span>
          {subLine && <span className="text-sm text-muted-foreground">{subLine}</span>}
          <span className="font-mono text-lg font-semibold tabular-nums">{roundLine}</span>
        </div>
        {list}
        {(kind === "amrap" || kind === "for_time") && (
          <button type="button" onClick={roundDone} className={cn(bigButton, "bg-primary text-primary-foreground")}>
            <Plus className="size-5" aria-hidden="true" />
            {t("roundDone")}
          </button>
        )}
        <button type="button" onClick={() => finish(true)} className={cn(bigButton, "bg-muted")}>
          <Square className="size-4" aria-hidden="true" />
          {t("finishEarly")}
        </button>
      </section>
    );
  }

  if (mode === "score") {
    const field = (id: string, label: string, value: string, set: (v: string) => void) => (
      <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => set(e.target.value)}
          className="h-12 rounded-xl border border-border bg-card px-3 font-mono text-lg font-semibold tabular-nums"
        />
      </label>
    );
    return (
      <section className="flex flex-col gap-4">
        {header}
        <h2 className="text-lg font-semibold">{t("enterScore")}</h2>
        {kind === "for_time" && (
          <div className="flex gap-3">
            {field("tb_min", t("minutes"), draft.min, (v) => setDraft((d) => ({ ...d, min: v })))}
            {field("tb_sec", t("seconds"), draft.sec, (v) => setDraft((d) => ({ ...d, sec: v })))}
          </div>
        )}
        <div className="flex gap-3">
          {field("tb_rounds", t("rounds"), draft.rounds, (v) => setDraft((d) => ({ ...d, rounds: v })))}
          {kind === "amrap" && field("tb_reps", t("extraReps"), draft.reps, (v) => setDraft((d) => ({ ...d, reps: v })))}
        </div>
        {kind === "for_time" && marks.length > 0 && (
          <p className="font-mono text-sm text-muted-foreground tabular-nums">
            {t("splits")}: {splitsFromMarks(marks).map(formatClock).join(" · ")}
          </p>
        )}
        <div role="group" aria-label={t("rxLabel")} className="flex gap-2">
          {([true, false] as const).map((rx) => (
            <button
              key={String(rx)}
              type="button"
              aria-pressed={draft.rx === rx}
              onClick={() => setDraft((d) => ({ ...d, rx }))}
              className={cn(
                "h-12 flex-1 rounded-xl border text-[15px] font-semibold",
                draft.rx === rx ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"
              )}
            >
              {rx ? t("rx") : t("scaled")}
            </button>
          ))}
        </div>
        <button type="button" onClick={save} className={cn(bigButton, "bg-primary text-primary-foreground")}>
          <Check className="size-5" aria-hidden="true" />
          {t("saveScore")}
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {header}
      {list}
      {result ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
            <Check className="size-4" strokeWidth={3} aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm text-muted-foreground">{t("score")}</span>
            <span className="truncate font-mono text-lg font-semibold tabular-nums">{text(result)}</span>
          </div>
          <button
            type="button"
            onClick={edit}
            aria-label={t("editScore")}
            className="flex size-11 items-center justify-center rounded-xl"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <>
          <button type="button" onClick={begin} className={cn(bigButton, "bg-primary text-primary-foreground")}>
            <Play className="size-5" aria-hidden="true" />
            {t("start")}
          </button>
          <button
            type="button"
            onClick={() => {
              setCounted(0);
              setMarks([]);
              setDraft(EMPTY_DRAFT);
              setMode("score");
            }}
            className="h-11 text-sm text-muted-foreground"
          >
            {t("enterWithoutTimer")}
          </button>
        </>
      )}
    </section>
  );
}
