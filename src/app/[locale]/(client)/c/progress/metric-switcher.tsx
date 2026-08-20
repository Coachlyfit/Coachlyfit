"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { ProgressLineChart } from "@/components/charts/progress-line-chart";

type Series = { key: string; label: string; color: string; unit?: string; data: { date: string; value: number }[] };

/** One chart on screen at a time, picked with a Segmented control — a
 * client scanning on a phone gets one clear chart instead of a scroll
 * through six stacked ones. */
export function MetricSwitcher({ series }: { series: Series[] }) {
  const t = useTranslations("progress.metrics");
  const [selected, setSelected] = useState(series[0]?.key ?? "");

  const active = series.find((s) => s.key === selected) ?? series[0];
  if (!active) return null;

  const options: SegmentedOption<string>[] = series.map((s) => ({ value: s.key, label: s.label }));

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <Segmented value={active.key} onChange={setSelected} options={options} label={t("title")} />
      </div>
      <ProgressLineChart data={active.data} label={active.label} color={active.color} unit={active.unit} />
    </div>
  );
}
