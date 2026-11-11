"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { historyQuery } from "@/domain/workouts/weight-history";

const ALL = "all";

/** Filters live in the URL (like RangePicker), so the server re-renders the
 * tab with the new query. Any filter change drops `n` — back to page one. */
export function WeightHistoryFilters({
  exercises,
  exerciseId,
  from,
  to,
}: {
  exercises: { id: string; name: string }[];
  exerciseId?: string;
  from?: string;
  to?: string;
}) {
  const t = useTranslations("clients.weightHistory");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const go = (next: { exerciseId?: string; from?: string; to?: string }) =>
    startTransition(() => router.replace(`${pathname}${historyQuery(next)}`, { scroll: false }));

  const items = [{ value: ALL, label: t("allExercises") }, ...exercises.map((e) => ({ value: e.id, label: e.name }))];
  const filtered = !!(exerciseId || from || to);

  return (
    <div className={`flex flex-wrap items-end gap-3 ${pending ? "opacity-60" : ""}`}>
      <div className="flex min-w-48 flex-col gap-1.5">
        <Label htmlFor="wh-exercise">{t("exercise")}</Label>
        <Select
          value={exerciseId ?? ALL}
          onValueChange={(v) => v !== null && go({ exerciseId: v === ALL ? undefined : v, from, to })}
          items={items}
        >
          <SelectTrigger id="wh-exercise" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wh-from">{t("from")}</Label>
        <Input
          id="wh-from"
          type="date"
          key={`from-${from ?? ""}`}
          defaultValue={from ?? ""}
          max={to}
          onChange={(e) => go({ exerciseId, from: e.target.value || undefined, to })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wh-to">{t("to")}</Label>
        <Input
          id="wh-to"
          type="date"
          key={`to-${to ?? ""}`}
          defaultValue={to ?? ""}
          min={from}
          onChange={(e) => go({ exerciseId, from, to: e.target.value || undefined })}
        />
      </div>
      {filtered && (
        <Button variant="ghost" onClick={() => go({})} disabled={pending}>
          {t("clear")}
        </Button>
      )}
    </div>
  );
}
