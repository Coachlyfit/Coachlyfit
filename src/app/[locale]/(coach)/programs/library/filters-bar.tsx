"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { AppLocale } from "@/domain/locale";
import type { LibrarySort, TemplateKind } from "@/domain/programs/platform/library-view";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string; count: number };
export type FilterGroup = { key: string; label: string; options: FilterOption[]; selected: string[] };

const SORTS: LibrarySort[] = ["name", "newest"];
const mono = "font-mono tabular-nums";
const control = "h-11 rounded-[11px]";

type Props = {
  locale: AppLocale;
  kind: TemplateKind;
  groups: FilterGroup[];
  q: string;
  onQ: (q: string) => void;
  sort: LibrarySort;
  onSort: (sort: LibrarySort) => void;
  onToggle: (group: string, value: string) => void;
  onClearGroup: (group: string) => void;
  onClearAll: () => void;
  resultCount: number;
};

/** Search + one filter per group (popover on md+, bottom sheet below), active chips and the result count.
 * One DOM for both sizes; the responsive classes show/hide the parts that differ. */
export function FiltersBar({
  locale,
  kind,
  groups,
  q,
  onQ,
  sort,
  onSort,
  onToggle,
  onClearGroup,
  onClearAll,
  resultCount,
}: Props) {
  const t = useTranslations("programs.library");
  const tf = useTranslations("programs.library.filters");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const num = (n: number) => formatNumber(n, locale);

  const active = groups.flatMap((g) =>
    g.selected.map((value) => ({
      group: g,
      value,
      label: g.options.find((o) => o.value === value)?.label ?? value,
    }))
  );
  const hasActive = active.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className={cn(control, "ps-10 text-base")}
          />
        </div>

        {/* md+: one popover per group */}
        {groups.map((g) => (
          <GroupPopover
            key={g.key}
            group={g}
            open={openGroup === g.key}
            onOpenChange={(open) => setOpenGroup(open ? g.key : null)}
            onToggle={(value) => onToggle(g.key, value)}
            onClear={() => onClearGroup(g.key)}
            num={num}
          />
        ))}

        <div className="max-md:hidden md:ms-auto">
          <Select value={sort} onValueChange={(v) => onSort(v as LibrarySort)} items={SORTS.map((s) => ({ value: s, label: t(`sort.${s}`) }))}>
            <SelectTrigger aria-label={t("sort.label")} className={cn(control, "data-[size=default]:h-11 px-3")}>
              <SelectValue>{(v: LibrarySort) => t("sort.value", { value: t(`sort.${v}`) })}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`sort.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* below md: one dark Filter button that opens the sheet */}
        <Button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={cn(control, "gap-1.5 bg-foreground px-3.5 font-semibold text-background hover:bg-foreground/90 md:hidden")}
        >
          <SlidersHorizontal aria-hidden="true" />
          {tf("button")}
          {hasActive && <Badge className={cn(mono, "h-5.5 min-w-5.5 rounded-full px-1.5")}>{num(active.length)}</Badge>}
        </Button>
      </div>

      {hasActive && (
        <div className="flex items-center gap-1.5 max-md:flex-nowrap max-md:overflow-x-auto max-md:[scrollbar-width:none] md:flex-wrap">
          {active.map(({ group, value, label }) => (
            <button
              key={`${group.key}:${value}`}
              type="button"
              aria-label={tf("remove", { value: label })}
              onClick={() => onToggle(group.key, value)}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent-tint ps-3 pe-2 text-sm text-accent-tint-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8.5"
            >
              <span className="opacity-75 max-md:hidden">{group.label}:</span>
              <span className="font-semibold">{label}</span>
              <span className="flex size-5 items-center justify-center rounded-full bg-card" aria-hidden="true">
                <X className="size-3" />
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={onClearAll}
            className="h-8.5 shrink-0 rounded-md px-2 text-sm font-medium text-primary underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:hidden"
          >
            {tf("clearAll")}
          </button>
        </div>
      )}

      <p className="text-sm text-muted-foreground" aria-live="polite">
        <span className={cn(mono, "font-semibold text-foreground")}>{num(resultCount)}</span>{" "}
        {t(kind === "plan" ? "unitPlan" : "unitWorkout", { count: resultCount })}
      </p>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="gap-0 overflow-hidden rounded-t-[22px] p-0 md:hidden">
          <span className="mx-auto mt-2 mb-0.5 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden="true" />
          <div className="flex shrink-0 items-center gap-2 border-b px-4 pt-1.5 pb-2.5">
            <SheetTitle className="flex-1 text-[17px] font-bold">{tf("title")}</SheetTitle>
            <button
              type="button"
              onClick={onClearAll}
              disabled={!hasActive}
              className="h-11 rounded-md px-2 font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
            >
              {tf("clearAll")}
            </button>
            <SheetClose render={<Button type="button" variant="secondary" size="icon" aria-label={tf("close")} className="size-11" />}>
              <X aria-hidden="true" />
            </SheetClose>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-3.5">
            {groups.map((g) => (
              <div key={g.key} role="group" aria-label={g.label} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{g.label}</span>
                  {g.selected.length > 0 && (
                    <span className="text-[13px] text-accent-tint-foreground">
                      <span className={mono}>{num(g.selected.length)}</span> {tf("selected")}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.options.map((o) => {
                    const on = g.selected.includes(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onToggle(g.key, o.value)}
                        className={cn(
                          "h-11 rounded-full border px-3.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          on ? "border-transparent bg-foreground text-background" : "bg-card"
                        )}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="shrink-0 border-t px-4 pt-3 pb-4">
            <SheetClose render={<Button type="button" className="h-13 w-full rounded-[14px] text-base font-semibold" />}>
              {tf.rich("showResults", {
                count: resultCount,
                shown: num(resultCount),
                n: (chunks) => <span className={mono}>{chunks}</span>,
              })}
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** md+ only: "<Group>: <summary> ▾" that opens a checklist popover. */
function GroupPopover({
  group,
  open,
  onOpenChange,
  onToggle,
  onClear,
  num,
}: {
  group: FilterGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (value: string) => void;
  onClear: () => void;
  num: (n: number) => string;
}) {
  const tf = useTranslations("programs.library.filters");
  const labels = group.selected.map((v) => group.options.find((o) => o.value === v)?.label ?? v);
  const applied = labels.length > 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className={cn(
          control,
          "flex items-center gap-1.5 border ps-3.5 pe-2.5 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:hidden",
          applied ? "border-transparent bg-accent-tint text-accent-tint-foreground" : "border-input bg-card"
        )}
      >
        <span className={applied ? "opacity-75" : "text-muted-foreground"}>{group.label}:</span>
        <span className="font-semibold">
          {!applied ? (
            tf("all")
          ) : (
            <>
              {labels[0]}
              {labels.length > 1 && <span className={cn(mono, "ms-1")}>+{num(labels.length - 1)}</span>}
            </>
          )}
        </span>
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-70 gap-0 p-0 max-md:hidden">
        <div className="flex items-center justify-between ps-3.5 pe-1.5 pt-2 pb-1">
          <PopoverTitle>{group.label}</PopoverTitle>
          <button
            type="button"
            onClick={onClear}
            disabled={!applied}
            className="h-8 rounded-md px-2 text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
          >
            {tf("clearGroup")}
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto px-1.5">
          {group.options.map((o) => (
            <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 hover:bg-muted">
              <Checkbox
                checked={group.selected.includes(o.value)}
                onCheckedChange={() => onToggle(o.value)}
                className="size-5 rounded-md"
              />
              <span className="flex-1">{o.label}</span>
              <span className={cn(mono, "text-[13px] text-muted-foreground")}>{num(o.count)}</span>
            </label>
          ))}
        </div>
        <div className="mt-1.5 border-t p-2.5">
          <Button type="button" className="h-10.5 w-full rounded-[10px] font-semibold" onClick={() => onOpenChange(false)}>
            {tf("done")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
