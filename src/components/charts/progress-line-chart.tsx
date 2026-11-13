"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";

// Recharts doesn't mirror itself for RTL — every chart in the app must
// reverse the x-axis and flip the y-axis to the opposite side, or a client
// reading right-to-left sees time flowing backwards. Wrapped once here so
// no future chart has to remember to do this.
export function ProgressLineChart({
  data,
  dataKey,
  label,
  color,
  unit,
  compact = false,
  highlight,
}: {
  data: { date: string; value: number }[];
  dataKey?: string;
  label: string;
  color: string;
  unit?: string;
  /** Sparkline: short, no grid or axes, y-range fitted to the data (a weight
   * line against a 0-based axis would be flat). Tooltip stays. */
  compact?: boolean;
  /** Index of a point to draw enlarged (the selected session). */
  highlight?: number;
}) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("progress.chart");
  const isRtl = locale === "ar";
  const key = dataKey ?? "value";
  // Recharts animates via JS, not CSS, so it ignores the global
  // prefers-reduced-motion media query in globals.css — read it once here.
  const [reduceMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const config: ChartConfig = { [key]: { label, color } };

  if (data.length === 0) {
    return (
      <div className={`flex w-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground ${compact ? "h-28" : "h-64"}`}>
        {t("empty")}
      </div>
    );
  }

  return (
    <ChartContainer config={config} className={compact ? "h-28 w-full" : "h-64 w-full"}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        {!compact && <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />}
        <XAxis
          hide={compact}
          dataKey="date"
          reversed={isRtl}
          tickFormatter={(d: string) => formatDate(d, locale, { month: "short", day: "numeric" })}
          className="text-xs"
          tickLine={false}
          minTickGap={16}
        />
        <YAxis
          hide={compact}
          domain={compact ? ["dataMin - 1", "dataMax + 1"] : undefined}
          orientation={isRtl ? "right" : "left"}
          className="text-xs"
          tickLine={false}
          axisLine={false}
          width={unit ? 52 : 36}
          unit={unit ? ` ${unit}` : undefined}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(d) => formatDate(String(d), locale, { dateStyle: "medium" })}
            />
          }
        />
        <Area
          type="monotone"
          dataKey={key}
          stroke={color}
          strokeWidth={2.5}
          fill={color}
          fillOpacity={0.08}
          dot={
            highlight == null
              ? compact
                ? false
                : { r: 3 }
              : ({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) => {
                  const on = index === highlight;
                  return (
                    <circle
                      key={index}
                      cx={cx}
                      cy={cy}
                      r={on ? 6 : compact ? 0 : 3}
                      fill={color}
                      stroke="var(--background)"
                      strokeWidth={on ? 2 : 0}
                    />
                  );
                }
          }
          isAnimationActive={!reduceMotion}
        />
      </AreaChart>
    </ChartContainer>
  );
}
