"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addDays } from "@/domain/nutrition/adherence";
import type { AppLocale } from "@/domain/locale";
import { adherence, type CellStatus } from "@/domain/programs/week-status";
import { ClientAvatar } from "../dashboard/client-avatar";
import {
  CELL_CLASS,
  TemplateCard,
  WeekLegend,
  dayMonth,
  mono,
  weekdayLabel,
  type AssignedRow,
  type ClientOption,
  type TemplateRow,
} from "./program-cards";

const ADHERENCE_WARNING_BELOW = 70;

// Rest never reaches the mobile day list (only clients training that day are
// listed), so it needs no tone.
const CELL_TONE: Partial<Record<CellStatus, StatusTone>> = { done: "success", missed: "destructive" };

function strong(chunks: React.ReactNode) {
  return (
    <span dir="ltr" className="font-mono font-semibold text-foreground tabular-nums">
      {chunks}
    </span>
  );
}

export function WeekView({
  locale,
  rows,
  templates,
  clients,
  weekStart,
  today,
  weekHref,
  templatesHref,
}: {
  locale: AppLocale;
  /** One row per client, already narrowed to their latest program. */
  rows: AssignedRow[];
  templates: TemplateRow[];
  clients: ClientOption[];
  weekStart: string;
  today: string;
  /** null = the current week (no ?week= in the URL). */
  weekHref: (week: string | null) => string;
  templatesHref: string;
}) {
  const t = useTranslations("programs");
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayIndex = dates.indexOf(today);
  const [selected, setSelected] = useState(Math.max(todayIndex, 0));

  const all = rows.flatMap((r) => r.viewCells);
  const done = all.filter((c) => c.status === "done").length;
  const planned = all.filter((c) => c.status !== "rest").length;

  const Prev = locale === "ar" ? ChevronRight : ChevronLeft;
  const Next = locale === "ar" ? ChevronLeft : ChevronRight;
  const navButton = buttonVariants({ variant: "outline", size: "icon-sm" });

  const training = rows.filter((r) => r.viewCells[selected].status !== "rest");
  const trainingDone = training.filter((r) => r.viewCells[selected].status === "done").length;

  return (
    <div className="flex flex-wrap items-start gap-5">
      <Card className="min-w-0 flex-[3_1_640px] gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
          <div className="flex flex-col leading-snug">
            <h2 className="text-xl leading-7 font-semibold">{t("week.title")}</h2>
            <span className="text-muted-foreground">
              <span dir="ltr" className="font-mono tabular-nums">
                {dayMonth(dates[0])} – {dayMonth(dates[6])}
              </span>
              {" · "}
              {t.rich("week.doneSoFar", {
                done: formatNumber(done, locale),
                planned: formatNumber(planned, locale),
                strong,
              })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href={weekHref(addDays(weekStart, -7))} scroll={false} className={navButton} aria-label={t("week.prev")}>
              <Prev className="size-4" aria-hidden="true" />
            </Link>
            <Link href={weekHref(null)} scroll={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("week.current")}
            </Link>
            <Link href={weekHref(addDays(weekStart, 7))} scroll={false} className={navButton} aria-label={t("week.next")}>
              <Next className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState brandMark title={t("week.empty")} description={t("week.emptyHint")} />
        ) : (
          <>
            <div className="hidden md:block">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[230px]">{t("week.client")}</TableHead>
                    {dates.map((date, i) => (
                      <TableHead
                        key={date}
                        aria-current={i === todayIndex ? "date" : undefined}
                        className={cn("px-1 text-center", i === todayIndex && "bg-primary/5 font-bold text-primary")}
                      >
                        <span className="flex flex-col leading-tight">
                          <span>{weekdayLabel(date, locale)}</span>
                          <span dir="ltr" className="font-mono text-xs tabular-nums">{dayMonth(date)}</span>
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="text-end">{t("week.adherence")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const pct = adherence(row.viewCells);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Link href={`/programs/${row.id}`} className="flex min-w-0 items-center gap-2.5">
                            <ClientAvatar id={row.clientId} name={row.client} size="default" />
                            <span className="flex min-w-0 flex-col leading-snug">
                              <span className="truncate font-semibold">{row.client}</span>
                              <span className="truncate text-muted-foreground">
                                {row.name}
                                {row.status !== "notStarted" && (
                                  <>
                                    {" · "}
                                    {t.rich("week.weekShort", { value: formatNumber(row.weekNo, locale), num: mono })}
                                  </>
                                )}
                              </span>
                            </span>
                          </Link>
                        </TableCell>
                        {row.viewCells.map((cell, i) => {
                          const status = t(`cell.${cell.status}`);
                          const day = weekdayLabel(cell.date, locale, "long");
                          return (
                            <TableCell key={cell.date} className={cn("px-1 py-2", i === todayIndex && "bg-primary/5")}>
                              <span
                                title={
                                  cell.status === "rest"
                                    ? t("cellTitleRest", { day })
                                    : t("cellTitle", { day, workout: cell.label ?? status, status })
                                }
                                className={cn(
                                  "flex h-11 items-center justify-center rounded-lg px-1 text-center text-xs leading-tight font-semibold",
                                  CELL_CLASS[cell.status],
                                  i === todayIndex && "outline-2 outline-primary"
                                )}
                              >
                                {cell.status === "rest" ? (
                                  <>
                                    <span aria-hidden="true">—</span>
                                    <span className="sr-only">{status}</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="line-clamp-2">{cell.label ?? status}</span>
                                    {cell.label && <span className="sr-only"> — {status}</span>}
                                  </>
                                )}
                              </span>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-end">
                          {pct == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={cn(
                                "font-mono font-semibold tabular-nums",
                                pct < ADHERENCE_WARNING_BELOW && "text-warning-tint-foreground"
                              )}
                            >
                              {formatNumber(pct, locale)}%
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <WeekLegend className="border-t border-border px-4 py-3" />
            </div>

            <div className="flex flex-col md:hidden">
              <div
                role="group"
                aria-label={t("week.daysLabel")}
                className="grid grid-cols-7 gap-1 border-b border-border px-3 pt-3 pb-2"
              >
                {dates.map((date, i) => {
                  const count = rows.filter((r) => r.viewCells[i].status !== "rest").length;
                  return (
                    <button
                      key={date}
                      type="button"
                      aria-pressed={i === selected}
                      aria-label={`${weekdayLabel(date, locale, "long")} ${dayMonth(date)}: ${t("week.training", { count })}`}
                      onClick={() => setSelected(i)}
                      className={cn(
                        "flex h-15.5 flex-col items-center justify-center gap-0.5 rounded-xl leading-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        i === selected
                          ? "bg-primary text-primary-foreground"
                          : i === todayIndex
                            ? "bg-accent-tint text-accent-tint-foreground"
                            : "bg-muted/60"
                      )}
                    >
                      <span className="text-xs">{weekdayLabel(date, locale)}</span>
                      <span className="font-mono font-semibold tabular-nums">{Number(date.slice(8))}</span>
                      <span className="font-mono text-[10px] tabular-nums opacity-90">
                        {count > 0 ? formatNumber(count, locale) : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2.5 p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-semibold">
                    {selected === todayIndex
                      ? t("todaySuffix", { label: weekdayLabel(dates[selected], locale, "long") })
                      : weekdayLabel(dates[selected], locale, "long")}
                  </span>
                  {training.length > 0 && (
                    <span className="text-muted-foreground">
                      {t("week.doneOf", {
                        done: formatNumber(trainingDone, locale),
                        total: formatNumber(training.length, locale),
                      })}
                    </span>
                  )}
                </div>
                {training.length === 0 && (
                  <p className="p-6 text-center text-muted-foreground">{t("week.allRest")}</p>
                )}
                {training.map((row) => {
                  const cell = row.viewCells[selected];
                  const tone = CELL_TONE[cell.status];
                  return (
                    <Link
                      key={row.id}
                      href={`/programs/${row.id}`}
                      className="flex items-center gap-3 rounded-xl px-3.5 py-3 ring-1 ring-foreground/10"
                    >
                      <ClientAvatar id={row.clientId} name={row.client} />
                      <span className="flex min-w-0 flex-1 flex-col leading-snug">
                        <span className="truncate font-semibold">{row.client}</span>
                        <span className="truncate text-muted-foreground">
                          {cell.label ? `${cell.label} · ${row.name}` : row.name}
                        </span>
                      </span>
                      {tone ? (
                        <StatusBadge tone={tone} className="shrink-0">
                          {t(`cell.${cell.status}`)}
                        </StatusBadge>
                      ) : (
                        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                          {t(`cell.${cell.status}`)}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </Card>

      {templates.length > 0 && (
        <aside aria-labelledby="week-templates" className="flex min-w-0 flex-[1_1_280px] flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="week-templates" className="text-xl leading-7 font-semibold">
              {t("sections.templates")}
            </h2>
            <Link href={templatesHref} className="font-medium text-primary hover:underline">
              {t("sections.allTemplates")}
            </Link>
          </div>
          {templates.map((row) => (
            <TemplateCard key={row.id} locale={locale} row={row} clients={clients} compact />
          ))}
        </aside>
      )}
    </div>
  );
}
