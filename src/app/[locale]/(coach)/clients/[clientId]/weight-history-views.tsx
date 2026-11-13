"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { ProgressLineChart } from "@/components/charts/progress-line-chart";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { pickBilingual, pickLocale, type AppLocale } from "@/domain/locale";
import type { HistorySession } from "@/domain/workouts/workouts.service";
import {
  exerciseTimelines,
  historyQuery,
  MAX_PAGE,
  metricValue,
  PAGE_SIZE,
  sessionExercises,
  type ExerciseTimeline,
  type HistoryMetric,
  type HistoryParams,
  type TimelinePoint,
} from "@/domain/workouts/weight-history";
import { useHistoryViewStore, type HistoryView } from "./weight-history-view-store";
import { useGroupText, WeightHistoryTable } from "./weight-history-table";

const SEARCH_THRESHOLD = 8;

type Selection = { exerciseId: string; sessionId: string };

/** By session / By exercise / Table over the sessions loaded so far. Every
 * number here is derived from those sessions (exerciseTimelines); "load
 * more" widens all three views at once. */
export function WeightHistoryViews({
  sessions,
  hasMore,
  params,
  locale,
  dates,
}: {
  sessions: HistorySession[];
  hasMore: boolean;
  params: HistoryParams;
  locale: AppLocale;
  dates: Record<string, string>;
}) {
  const t = useTranslations("clients.weightHistory");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const { view, setView } = useHistoryViewStore();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const groupText = useGroupText(locale);

  const timelines = useMemo(() => exerciseTimelines(sessions, !hasMore), [sessions, hasMore]);
  const byId = useMemo(() => new Map(timelines.map((tl) => [tl.exerciseId, tl])), [timelines]);
  const nameOf = (tl: ExerciseTimeline) => (tl.name ? pickBilingual(tl.name, locale) : t("unknownExercise"));
  const groupsText = (session: HistorySession | undefined, exerciseId: string) => {
    const ex = session && sessionExercises(session).find((e) => e.exerciseId === exerciseId);
    return ex ? ex.groups.map((g) => groupText(g, ex.measurementType)).join(" · ") : "—";
  };

  useEffect(() => {
    if (selection) panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selection]);

  const selectedTimeline = selection ? byId.get(selection.exerciseId) : undefined;
  const isSelected = (exerciseId: string, sessionId?: string) =>
    selection?.exerciseId === exerciseId && (sessionId == null || selection.sessionId === sessionId);

  const exerciseList = [...timelines]
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    .filter((tl) => !query.trim() || nameOf(tl).toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-4">
      <Segmented<HistoryView>
        label={t("view")}
        value={view}
        onChange={setView}
        options={[
          { value: "session", label: t("viewBySession") },
          { value: "exercise", label: t("viewByExercise") },
          { value: "table", label: t("viewTable") },
        ]}
      />

      {view === "session" && (
        <div className="flex flex-col gap-3">
          {sessions.map((session) => {
            const exercises = sessionExercises(session);
            return (
              <div key={session.id} className="rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold">
                    {dates[session.id]} · {pickLocale(session.program_days, locale, "label") || t("workoutFallback")}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t("sessionMeta", { sets: session.workout_set_logs.length, exercises: exercises.length })}
                  </p>
                </div>
                {exercises.map((ex) => {
                  const tl = byId.get(ex.exerciseId);
                  const point = tl?.points.find((p) => p.sessionId === session.id);
                  if (!tl || !point) return null;
                  return (
                    <ExerciseRow
                      key={ex.exerciseId}
                      name={nameOf(tl)}
                      timeline={tl}
                      point={point}
                      fallback={groupsText(session, ex.exerciseId)}
                      selected={isSelected(ex.exerciseId, session.id)}
                      onSelect={() => setSelection({ exerciseId: ex.exerciseId, sessionId: session.id })}
                      locale={locale}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {view === "exercise" && (
        <div className="flex flex-col gap-3">
          {timelines.length > SEARCH_THRESHOLD && (
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchExercises")}
              aria-label={t("searchExercises")}
              className="sm:max-w-xs"
            />
          )}
          <div className="rounded-xl border border-border bg-card">
            {exerciseList.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("noMatches")}</p>
            ) : (
              exerciseList.map((tl) => {
                const latest = tl.points.findLast((p) => p.top) ?? tl.points[tl.points.length - 1];
                return (
                  <ExerciseRow
                    key={tl.exerciseId}
                    name={nameOf(tl)}
                    timeline={tl}
                    point={latest}
                    fallback={groupsText(
                      sessions.find((s) => s.id === latest.sessionId),
                      tl.exerciseId
                    )}
                    selected={isSelected(tl.exerciseId)}
                    onSelect={() => setSelection({ exerciseId: tl.exerciseId, sessionId: latest.sessionId })}
                    locale={locale}
                  />
                );
              })
            )}
          </div>
        </div>
      )}

      {view === "table" && <WeightHistoryTable sessions={sessions} dates={dates} locale={locale} />}

      {view !== "table" && selection && selectedTimeline && (
        <div ref={panelRef} className="scroll-mt-4">
          <DetailPanel
            key={selection.exerciseId}
            name={nameOf(selectedTimeline)}
            timeline={selectedTimeline}
            sessionId={selection.sessionId}
            onSelectSession={(sessionId) => setSelection({ exerciseId: selectedTimeline.exerciseId, sessionId })}
            dates={dates}
            locale={locale}
          />
        </div>
      )}

      {hasMore && params.limit < MAX_PAGE && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(() =>
                router.replace(`${pathname}${historyQuery({ ...params, limit: params.limit + PAGE_SIZE })}`, { scroll: false })
              )
            }
          >
            {pending ? t("loading") : t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}

function ExerciseRow({
  name,
  timeline,
  point,
  fallback,
  selected,
  onSelect,
  locale,
}: {
  name: string;
  timeline: ExerciseTimeline;
  point: TimelinePoint;
  fallback: string;
  selected: boolean;
  onSelect: () => void;
  locale: AppLocale;
}) {
  const weighted = timeline.points.filter((p) => p.top);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-start transition-colors last:border-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
        selected && "bg-muted"
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      {point.top ? (
        <>
          <TopSetText point={point} locale={locale} className="text-sm font-semibold" />
          <Sparkline values={weighted.map((p) => p.top!.weight)} active={weighted.indexOf(point)} />
          <DeltaChip delta={point.delta} locale={locale} />
        </>
      ) : (
        <span className="text-sm text-muted-foreground tabular-nums">{fallback}</span>
      )}
    </button>
  );
}

function TopSetText({ point, locale, className }: { point: TimelinePoint; locale: AppLocale; className?: string }) {
  const t = useTranslations("clients.weightHistory");
  if (!point.top) return <span className={className}>—</span>;
  return (
    <span dir="ltr" className={cn("shrink-0 font-mono tabular-nums", className)}>
      {t("bestSetLine", {
        weight: formatNumber(point.top.weight, locale, { maximumFractionDigits: 1 }),
        reps: point.top.reps ?? "—",
      })}
    </span>
  );
}

function DeltaChip({ delta, locale }: { delta: TimelinePoint["delta"]; locale: AppLocale }) {
  const t = useTranslations("clients.weightHistory");
  // Reserve the slot so rows stay aligned when there is no chip.
  if (delta == null) return <span className="w-16 shrink-0" aria-hidden="true" />;
  const tone =
    delta === "new"
      ? "bg-primary/10 text-primary"
      : delta > 0
        ? "bg-success/10 text-success"
        : delta < 0
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground";
  const text =
    delta === "new"
      ? t("deltaNew")
      : delta === 0
        ? formatNumber(0, locale)
        : t("deltaKg", { delta: formatNumber(delta, locale, { maximumFractionDigits: 1, signDisplay: "exceptZero" }) });
  return (
    <span
      dir={delta === "new" ? undefined : "ltr"}
      className={cn("w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium tabular-nums", tone)}
    >
      {text}
    </span>
  );
}

/** ponytail: hand-drawn SVG, not recharts — a page can show ~60 of these and
 * one ResponsiveContainer per row is far heavier than a polyline. Flipped in
 * RTL so time runs the same way as ProgressLineChart's reversed x-axis. */
function Sparkline({ values, active }: { values: number[]; active: number }) {
  const W = 80;
  const H = 24;
  const PAD = 3;
  if (values.length < 2) return <span className="hidden w-20 shrink-0 sm:block" aria-hidden="true" />;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => [PAD + (i * (W - 2 * PAD)) / (values.length - 1), H - PAD - ((v - min) / span) * (H - 2 * PAD)]);
  const dot = pts[active];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="hidden h-6 w-20 shrink-0 text-chart-1 sm:block rtl:-scale-x-100"
      aria-hidden="true"
    >
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.6}
      />
      {dot && <circle cx={dot[0]} cy={dot[1]} r={3} fill="currentColor" />}
    </svg>
  );
}

function DetailPanel({
  name,
  timeline,
  sessionId,
  onSelectSession,
  dates,
  locale,
}: {
  name: string;
  timeline: ExerciseTimeline;
  sessionId: string;
  onSelectSession: (sessionId: string) => void;
  dates: Record<string, string>;
  locale: AppLocale;
}) {
  const t = useTranslations("clients.weightHistory");
  const tm = useTranslations("measure");
  const [metric, setMetric] = useState<HistoryMetric>("top");
  const metricLabels: Record<HistoryMetric, string> = {
    top: t("metricTop"),
    e1rm: t("metricE1rm"),
    volume: t("metricVolume"),
  };
  const series = timeline.points.flatMap((p) => {
    const value = metricValue(p, metric);
    return value == null ? [] : [{ date: p.date, value, sessionId: p.sessionId }];
  });
  const highlight = series.findIndex((p) => p.sessionId === sessionId);

  return (
    <section aria-label={name} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-base font-semibold tracking-tight">{name}</h3>
        <p className="text-sm text-muted-foreground">{dates[sessionId]}</p>
      </div>
      <Segmented<HistoryMetric>
        label={t("metric")}
        value={metric}
        onChange={setMetric}
        options={(["top", "e1rm", "volume"] as const).map((m) => ({ value: m, label: metricLabels[m] }))}
      />
      <ProgressLineChart
        data={series}
        label={metricLabels[metric]}
        color="var(--chart-1)"
        unit={tm("unit.kg")}
        highlight={highlight >= 0 ? highlight : undefined}
      />
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">{t("history")}</h4>
        <ul className="flex flex-col rounded-lg border border-border">
          {[...timeline.points].reverse().map((p) => (
            <li key={p.sessionId} className="border-b border-border last:border-0">
              <button
                type="button"
                aria-pressed={p.sessionId === sessionId}
                onClick={() => onSelectSession(p.sessionId)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-muted/50",
                  p.sessionId === sessionId && "bg-muted"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{dates[p.sessionId]}</span>
                <TopSetText point={p} locale={locale} />
                <DeltaChip delta={p.delta} locale={locale} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
