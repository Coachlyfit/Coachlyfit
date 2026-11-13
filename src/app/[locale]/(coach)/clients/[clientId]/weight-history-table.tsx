"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pickBilingual, pickLocale, type AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import type { HistorySession } from "@/domain/workouts/workouts.service";
import { measurementFields, type MeasurementType } from "@/domain/library/measurement";
import { formatSetMeasures } from "@/domain/workouts/set-measures";
import { compareSessions, sessionExercises, type SetGroup } from "@/domain/workouts/weight-history";

const MAX_COMPARE = 2;

/** "3 × 8 × 60 kg" / "3 × 45 s" for one collapsed set group. Shared with the
 * By session / By exercise views for exercises without a weighted top set. */
export function useGroupText(locale: AppLocale) {
  const t = useTranslations("clients.weightHistory");
  const tm = useTranslations("measure");
  const num = (v: number) => formatNumber(v, locale, { maximumFractionDigits: 1 });
  const dash = "—";
  return (g: SetGroup, type: MeasurementType) => {
    const repBased =
      g.duration_seconds == null &&
      g.distance_m == null &&
      g.calories == null &&
      measurementFields(type).includes("reps");
    if (repBased) {
      return g.weight != null
        ? t("setLine", { sets: g.sets, reps: g.reps ?? dash, weight: num(g.weight) })
        : t("setLineBodyweight", { sets: g.sets, reps: g.reps ?? dash });
    }
    const value = formatSetMeasures(
      type,
      null,
      {
        weight: g.weight,
        reps: g.reps,
        duration_seconds: g.duration_seconds ?? null,
        distance_m: g.distance_m ?? null,
        calories: g.calories ?? null,
        extra: null,
      },
      tm
    );
    return t("groupLine", { sets: g.sets, value });
  };
}

/** Sessions with per-exercise sets × reps × weight, plus an A/B compare.
 * Selection is UI-only state. `dates` are the session dates formatted on the
 * server, so server and browser render identical text (no time-zone
 * hydration mismatch). */
export function WeightHistoryTable({
  sessions,
  dates,
  locale,
}: {
  sessions: HistorySession[];
  dates: Record<string, string>;
  locale: AppLocale;
}) {
  const t = useTranslations("clients.weightHistory");
  const groupText = useGroupText(locale);
  const [selected, setSelected] = useState<string[]>([]);

  const num = (v: number) => formatNumber(v, locale, { maximumFractionDigits: 1 });
  const signed = (v: number) => formatNumber(v, locale, { maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const exerciseName = (name: { ar: string; en: string } | null) => (name ? pickBilingual(name, locale) : t("unknownExercise"));
  const dash = "—";

  const toggle = (id: string, on: boolean) =>
    setSelected((cur) => (on ? (cur.includes(id) || cur.length >= MAX_COMPARE ? cur : [...cur, id]) : cur.filter((x) => x !== id)));

  // A = the older session, so a positive difference reads as progress.
  const picked = selected
    .map((id) => sessions.find((s) => s.id === id))
    .filter((s): s is HistorySession => !!s)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  const comparison = picked.length === 2 ? compareSessions(picked[0], picked[1]) : null;
  const sessionLabel = (s: HistorySession) =>
    `${dates[s.id]} · ${pickLocale(s.program_days, locale, "label") || t("workoutFallback")}`;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("compareHint")}</p>

      {comparison && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("compareTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">{t("colExercise")}</TableHead>
                  <TableHead className="text-start">{t("sessionA", { label: sessionLabel(picked[0]) })}</TableHead>
                  <TableHead className="text-start">{t("sessionB", { label: sessionLabel(picked[1]) })}</TableHead>
                  <TableHead className="text-end">{t("diffKg")}</TableHead>
                  <TableHead className="text-end">{t("diffPct")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.map((row) => {
                  const tone =
                    row.diffKg == null || row.diffKg === 0
                      ? "text-muted-foreground"
                      : row.diffKg > 0
                        ? "text-success"
                        : "text-destructive";
                  return (
                    <TableRow key={row.exerciseId}>
                      <TableCell>{exerciseName(row.name)}</TableCell>
                      <TableCell className="tabular-nums">{row.a != null ? t("weightKg", { weight: num(row.a) }) : dash}</TableCell>
                      <TableCell className="tabular-nums">{row.b != null ? t("weightKg", { weight: num(row.b) }) : dash}</TableCell>
                      <TableCell dir="ltr" className={`text-end tabular-nums ${tone}`}>
                        {row.diffKg != null ? signed(row.diffKg) : dash}
                      </TableCell>
                      <TableCell dir="ltr" className={`text-end tabular-nums ${tone}`}>
                        {row.diffPct != null ? `${signed(row.diffPct)}%` : dash}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t("compare")}</TableHead>
              <TableHead className="text-start">{t("colDate")}</TableHead>
              <TableHead className="text-start">{t("colWorkout")}</TableHead>
              <TableHead className="text-start">{t("colExercises")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => {
              const isOn = selected.includes(session.id);
              return (
                <TableRow key={session.id} data-state={isOn ? "selected" : undefined}>
                  <TableCell className="align-top">
                    <Checkbox
                      checked={isOn}
                      disabled={!isOn && selected.length >= MAX_COMPARE}
                      onCheckedChange={(on) => toggle(session.id, on === true)}
                      aria-label={t("selectRow", { label: sessionLabel(session) })}
                    />
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap">
                    {dates[session.id]}
                  </TableCell>
                  <TableCell className="align-top">
                    {pickLocale(session.program_days, locale, "label") || t("workoutFallback")}
                  </TableCell>
                  <TableCell>
                    <ul className="flex flex-col gap-1">
                      {sessionExercises(session).map((ex) => (
                        <li key={ex.exerciseId} className="text-sm">
                          <span className="font-medium">{exerciseName(ex.name)}</span>
                          <span className="ms-2 text-muted-foreground tabular-nums">
                            {ex.groups.map((g) => groupText(g, ex.measurementType)).join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

    </div>
  );
}
