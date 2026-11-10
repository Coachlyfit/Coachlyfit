import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";

const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Circular "done / planned" dial for the client home header — a plain
 * stroke-dasharray ring, not the linear shadcn Progress primitive, since the
 * visual (a count dial with the fraction inside) is a different shape
 * entirely. Sits on the sidebar-colored header card and paints with the
 * sidebar foreground, not --primary: a coach's brand can make primary dark,
 * and the sidebar foreground is the one color guaranteed readable on it. `total` must be > 0; callers hide the ring otherwise. */
export function WeeklyProgressRing({
  done,
  total,
  label,
  ariaLabel,
  locale,
}: {
  done: number;
  total: number;
  /** Small caption under the fraction ("workouts"). */
  label: string;
  ariaLabel: string;
  locale: AppLocale;
}) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;

  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={ariaLabel} className="size-28 shrink-0" fill="none">
      <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="currentColor" strokeWidth="12" className="text-sidebar-foreground/15" />
      <circle
        cx="60"
        cy="60"
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
        transform="rotate(-90 60 60)"
        className="text-sidebar-foreground"
      />
      {/* direction="ltr": the "3/5" fraction must not reorder under RTL. */}
      <text
        x="60"
        y="63"
        textAnchor="middle"
        direction="ltr"
        className="fill-sidebar-foreground font-mono text-[26px] font-semibold"
      >
        {formatNumber(done, locale)}/{formatNumber(total, locale)}
      </text>
      <text x="60" y="82" textAnchor="middle" className="fill-sidebar-foreground/70 text-[12px]">
        {label}
      </text>
    </svg>
  );
}
