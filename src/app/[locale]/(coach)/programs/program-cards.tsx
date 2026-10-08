"use client";

import { useTranslations } from "next-intl";
import { Copy, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Link } from "@/i18n/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { CellStatus, ProgramStatus } from "@/domain/programs/week-status";
import { ClientAvatar } from "../dashboard/client-avatar";
import { AssignTemplateDialog } from "./[programId]/assign-template-dialog";

export type Cell = { date: string; status: CellStatus; label: string | null };

export type AssignedRow = {
  id: string;
  clientId: string;
  client: string;
  name: string;
  status: ProgramStatus;
  startDate: string;
  weekNo: number;
  trainingDays: number;
  /** The current week — what the card strip and status describe. */
  cells: Cell[];
  /** The week the grid is navigated to (same as `cells` by default). */
  viewCells: Cell[];
};

export type TemplateRow = {
  id: string;
  name: string;
  split: string[];
  exercises: number;
  usedBy: number;
};

export type ClientOption = { id: string; display_name: string };

/** Status is never carried by color alone: every use pairs these with a
 * glyph, the workout name plus an sr-only status, or the legend below. */
export const CELL_CLASS: Record<CellStatus, string> = {
  done: "bg-success-tint text-success-tint-foreground ring-1 ring-inset ring-success",
  missed: "bg-destructive-tint text-destructive-tint-foreground ring-1 ring-inset ring-destructive",
  upcoming: "bg-card text-muted-foreground ring-1 ring-inset ring-muted-foreground/60",
  rest: "bg-muted text-muted-foreground",
};

export const STATUS_TONE: Record<ProgramStatus, StatusTone> = {
  ongoing: "success",
  behind: "warning",
  notStarted: "accent",
};

const CELL_GLYPH: Partial<Record<CellStatus, string>> = { done: "✓", missed: "✕" };
const LEGEND = ["done", "missed", "upcoming", "rest"] as const;

export function mono(chunks: React.ReactNode) {
  // dir="ltr": "2/5" and "03/10" must not be reordered by the RTL paragraph.
  return (
    <span dir="ltr" className="font-mono tabular-nums">
      {chunks}
    </span>
  );
}

export function weekdayLabel(date: string, locale: AppLocale, weekday: "short" | "long" = "short") {
  return formatDate(date, locale, { weekday, timeZone: "UTC" });
}

/** "03.10" — day first in both locales (en-EG's Intl output is month-first,
 * which reads as the wrong date next to an Arabic-speaking coach's clients). */
export function dayMonth(date: string) {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

export function WeekLegend({ className }: { className?: string }) {
  const t = useTranslations("programs.cell");
  return (
    <ul className={cn("flex flex-wrap gap-x-3.5 gap-y-1 text-muted-foreground", className)}>
      {LEGEND.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded-[3px]", CELL_CLASS[status])} aria-hidden="true" />
          {t(status)}
        </li>
      ))}
    </ul>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{children}</span>;
}

export function ProgramCard({
  locale,
  row,
  today,
  clients,
}: {
  locale: AppLocale;
  row: AssignedRow;
  today: string;
  clients: ClientOption[];
}) {
  const t = useTranslations("programs");
  const done = row.cells.filter((c) => c.status === "done").length;
  const planned = row.cells.filter((c) => c.status !== "rest").length;

  return (
    <article className="flex flex-col gap-3.5 rounded-xl bg-card p-4.5 ring-1 ring-foreground/10">
      <div className="flex items-center gap-3">
        <ClientAvatar id={row.clientId} name={row.client} />
        <div className="flex min-w-0 flex-1 flex-col leading-snug">
          <span className="truncate font-semibold">{row.client}</span>
          <span className="truncate text-muted-foreground">{row.name}</span>
        </div>
        <StatusBadge tone={STATUS_TONE[row.status]} className="shrink-0">
          {t(`status.${row.status}`)}
        </StatusBadge>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-2">
          <span className="font-medium">{t("thisWeek")}</span>
          <span className="text-muted-foreground">
            {t.rich("workoutsDone", {
              done: formatNumber(done, locale),
              planned: formatNumber(planned, locale),
              num: mono,
            })}
          </span>
        </div>
        <ol className="grid grid-cols-7 gap-1">
          {row.cells.map((cell) => {
            const isToday = cell.date === today;
            const day = weekdayLabel(cell.date, locale);
            const title = `${day} — ${t(`cell.${cell.status}`)}`;
            return (
              <li
                key={cell.date}
                title={isToday ? t("todaySuffix", { label: title }) : title}
                className="flex flex-col items-center gap-0.5"
              >
                <span
                  className={cn(
                    "flex h-7.5 w-full items-center justify-center rounded-lg font-semibold",
                    CELL_CLASS[cell.status],
                    isToday && "outline-2 outline-primary"
                  )}
                >
                  <span aria-hidden="true">{CELL_GLYPH[cell.status]}</span>
                  <span className="sr-only">{isToday ? t("todaySuffix", { label: title }) : title}</span>
                </span>
                <span
                  className={cn("text-xs", isToday ? "font-semibold text-primary" : "text-muted-foreground")}
                  aria-hidden="true"
                >
                  {day}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {row.status !== "notStarted" && (
          <Chip>{t.rich("chips.week", { value: formatNumber(row.weekNo, locale), num: mono })}</Chip>
        )}
        <Chip>
          {t.rich("chips.daysPerWeek", {
            value: formatNumber(row.trainingDays, locale),
            count: row.trainingDays,
            num: mono,
          })}
        </Chip>
        <Chip>
          {t.rich(row.status === "notStarted" ? "chips.starts" : "chips.started", {
            date: dayMonth(row.startDate),
            num: mono,
          })}
        </Chip>
      </div>

      <div className="mt-auto flex gap-2 border-t border-border pt-3">
        <Link
          href={`/programs/${row.id}`}
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "flex-1")}
        >
          {t("actions.open")}
        </Link>
        <Link
          href={`/messages/${row.clientId}`}
          className={buttonVariants({ variant: "outline", size: "icon-sm" })}
          aria-label={t("actions.message", { name: row.client })}
        >
          <MessageCircle className="size-4" aria-hidden="true" />
        </Link>
        <AssignTemplateDialog
          locale={locale}
          programId={row.id}
          clients={clients}
          mode="duplicate"
          trigger={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("actions.duplicate")}
              disabled={clients.length === 0}
            />
          }
        >
          <Copy className="size-4" aria-hidden="true" />
        </AssignTemplateDialog>
      </div>
    </article>
  );
}

/** `compact` is the week view's side panel: the split as chips, no stats. */
export function TemplateCard({
  locale,
  row,
  clients,
  compact = false,
}: {
  locale: AppLocale;
  row: TemplateRow;
  clients: ClientOption[];
  compact?: boolean;
}) {
  const t = useTranslations("programs");
  const days = row.split.length;

  return (
    <article
      className={cn("flex flex-col rounded-xl bg-card ring-1 ring-foreground/10", compact ? "gap-2 p-3.5" : "gap-3 p-4.5")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-semibold">{row.name}</span>
        {compact ? (
          <span className="shrink-0 text-muted-foreground">
            {t.rich("week.days", { value: formatNumber(days, locale), count: days, num: mono })}
          </span>
        ) : (
          <StatusBadge tone="accent" className="shrink-0">
            {t("template")}
          </StatusBadge>
        )}
      </div>

      {compact ? (
        days > 0 && (
          <ul className="flex gap-1">
            {row.split.map((label, i) => (
              <li
                key={i}
                className="flex h-6.5 min-w-0 flex-1 items-center justify-center rounded-md bg-muted px-1 text-xs font-medium"
              >
                <span className="truncate">{label}</span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          {days > 0 && <span className="text-muted-foreground">{row.split.join(" · ")}</span>}
          <div className="flex flex-wrap gap-1.5">
            <Chip>
              {t.rich("chips.daysPerWeek", { value: formatNumber(days, locale), count: days, num: mono })}
            </Chip>
            <Chip>
              {t.rich("chips.exercises", {
                value: formatNumber(row.exercises, locale),
                count: row.exercises,
                num: mono,
              })}
            </Chip>
            <Chip>
              {t.rich("chips.usedBy", { value: formatNumber(row.usedBy, locale), count: row.usedBy, num: mono })}
            </Chip>
          </div>
        </>
      )}

      <div className="mt-auto flex gap-2">
        <AssignTemplateDialog
          locale={locale}
          programId={row.id}
          clients={clients}
          trigger={<Button type="button" size="sm" className="flex-1" disabled={clients.length === 0} />}
        >
          {t("actions.assign")}
        </AssignTemplateDialog>
        <Link href={`/programs/${row.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("actions.edit")}
        </Link>
      </div>
    </article>
  );
}
