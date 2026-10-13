"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DatePicker } from "@/components/date-picker";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import {
  PRODUCTIVITY_RANGES,
  completionRate,
  durationParts,
  onTimeRate,
  sumCounts,
  type ProductivityCounts,
  type ProductivityRange,
} from "@/domain/tasks/productivity";

type Member = { id: string; name: string; counts: ProductivityCounts };

const TILE = "flex flex-col gap-1 rounded-xl bg-card p-4.5 ring-1 ring-foreground/10";
const FIGURE = "font-mono text-2xl leading-8 font-semibold tabular-nums";
const NUM = "font-mono tabular-nums";

/** Every figure is a count from task_productivity() or a ratio of two of
 * them -- there is no blended score. The tiles show the selected member, or
 * the whole team when nobody is selected. */
export function ProductivityView({
  locale,
  members,
  range,
  from,
  to,
  memberId,
}: {
  locale: AppLocale;
  members: Member[];
  range: ProductivityRange;
  /** "YYYY-MM-DD", inclusive. */
  from: string;
  to: string;
  memberId: string | null;
}) {
  const t = useTranslations("tasks.productivity");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function go(next: { range?: ProductivityRange; from?: string; to?: string; member?: string | null }) {
    const state = { range, from, to, member: memberId, ...next };
    const params = new URLSearchParams();
    if (state.range !== "30d") params.set("range", state.range);
    if (state.range === "custom") {
      params.set("from", state.from);
      params.set("to", state.to);
    }
    if (state.member) params.set("member", state.member);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  const selected = members.find((member) => member.id === memberId) ?? null;
  const team = sumCounts(members.map((member) => member.counts));
  const shown = selected?.counts ?? team;

  const count = (value: number) => formatNumber(value, locale);
  const percent = (value: number | null) =>
    value === null ? "—" : formatNumber(value, locale, { style: "percent", maximumFractionDigits: 0 });
  const duration = (seconds: number | null) => {
    if (seconds === null) return "—";
    const { unit, count: amount } = durationParts(seconds);
    return t(unit, { count: formatNumber(amount, locale) });
  };

  const tiles: [string, string, string?][] = [
    [t("assigned"), count(shown.assigned)],
    [t("completed"), count(shown.completed)],
    [t("completionRate"), percent(completionRate(shown))],
    [t("onTime"), count(shown.completedOnTime)],
    [t("onTimeRate"), percent(onTimeRate(shown)), t("onTimeHint")],
    [t("overdue"), count(shown.overdue)],
    [t("avgTime"), duration(shown.avgCompletionSeconds)],
  ];

  return (
    <div className={cn("flex flex-col gap-5", pending && "opacity-60")}>
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl leading-9 font-semibold">{selected ? selected.name : t("title")}</h1>
        <div className="flex flex-wrap items-end gap-3">
          <Segmented
            label={t("rangeLabel")}
            value={range}
            onChange={(next) => go({ range: next })}
            options={PRODUCTIVITY_RANGES.map((value) => ({ value, label: t(`range_${value}`) }))}
          />
          {range === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex w-44 flex-col gap-1.5">
                <Label htmlFor="productivity_from">{t("from")}</Label>
                {/* A cleared or reversed date would fall back to 30 days on the
                    server; keep the window valid here instead. */}
                <DatePicker
                  id="productivity_from"
                  value={from}
                  onChange={(value) => value && go({ from: value, to: value > to ? value : to })}
                />
              </div>
              <div className="flex w-44 flex-col gap-1.5">
                <Label htmlFor="productivity_to">{t("to")}</Label>
                <DatePicker
                  id="productivity_to"
                  value={to}
                  onChange={(value) => value && go({ to: value, from: value < from ? value : from })}
                />
              </div>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          <span className={NUM}>{formatDate(from, locale)}</span> – <span className={NUM}>{formatDate(to, locale)}</span>
          {" · "}
          {t("explain")}
        </p>
      </header>

      <section
        aria-label={selected ? selected.name : t("teamOverview")}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        {tiles.map(([label, value, hint]) => (
          <div key={label} className={TILE}>
            <span className="text-[0.8125rem] text-muted-foreground">{label}</span>
            <span className={FIGURE}>{value}</span>
            {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
          </div>
        ))}
      </section>

      {selected ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonVariants({ variant: "outline" })} onClick={() => go({ member: null })}>
            {t("allMembers")}
          </button>
          <Link href={`/tasks?assignee=${selected.id}`} className={buttonVariants({ variant: "outline" })}>
            {t("viewTasks")}
          </Link>
        </div>
      ) : team.assigned === 0 ? (
        <Card>
          <EmptyState title={t("noData")} description={t("noDataHint")} />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("member")}</TableHead>
                <TableHead className="text-end">{t("assigned")}</TableHead>
                <TableHead className="text-end">{t("completed")}</TableHead>
                <TableHead className="text-end">{t("completionRate")}</TableHead>
                <TableHead className="text-end">{t("onTimeRate")}</TableHead>
                <TableHead className="text-end">{t("overdue")}</TableHead>
                <TableHead className="text-end">{t("avgTime")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => go({ member: member.id })}
                      className="flex min-h-11 items-center text-start font-medium underline-offset-4 hover:underline md:min-h-0"
                    >
                      {member.name}
                    </button>
                  </TableCell>
                  <TableCell className={cn(NUM, "text-end")}>{count(member.counts.assigned)}</TableCell>
                  <TableCell className={cn(NUM, "text-end")}>{count(member.counts.completed)}</TableCell>
                  <TableCell className={cn(NUM, "text-end")}>{percent(completionRate(member.counts))}</TableCell>
                  <TableCell className={cn(NUM, "text-end")}>{percent(onTimeRate(member.counts))}</TableCell>
                  <TableCell
                    className={cn(
                      NUM,
                      "text-end",
                      member.counts.overdue > 0 && "font-semibold text-destructive-tint-foreground"
                    )}
                  >
                    {count(member.counts.overdue)}
                  </TableCell>
                  <TableCell className={cn(NUM, "text-end")}>{duration(member.counts.avgCompletionSeconds)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
