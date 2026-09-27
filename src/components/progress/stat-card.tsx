import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TREND_ICON = { up: ArrowUp, down: ArrowDown, flat: Minus } as const;

/** The KPI-tile idiom copy-pasted across the coach dashboard and admin
 * pages, extracted once. `value` arrives pre-formatted (formatNumber /
 * formatDate) by the caller — this component stays locale-unaware.
 * `trend` is the arrow direction only; `trendTone` is the caller's call on
 * whether that direction is good news — a falling weight trend and a
 * falling adherence trend are not the same story. */
export function StatCard({
  label,
  value,
  hint,
  trend,
  trendTone = "neutral",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: "up" | "down" | "flat";
  trendTone?: "good" | "bad" | "neutral";
  className?: string;
}) {
  const TrendIcon = trend ? TREND_ICON[trend] : null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-baseline gap-2">
        <p className="truncate text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p>
        {TrendIcon && (
          <TrendIcon
            className={cn(
              "size-4 shrink-0",
              trendTone === "good" && "text-success",
              trendTone === "bad" && "text-destructive",
              trendTone === "neutral" && "text-muted-foreground"
            )}
            aria-hidden="true"
          />
        )}
      </CardContent>
      {hint && <p className="px-(--card-spacing) text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
