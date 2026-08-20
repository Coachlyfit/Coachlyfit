import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";

const RADIUS = 32;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Circular week-progress indicator for the client Today card — a plain
 * stroke-dasharray ring, not the linear shadcn Progress primitive, since
 * the visual (a percentage dial with the number inside) is a different
 * shape entirely. `pct` is 0-100. */
export function WeeklyProgressRing({ pct, locale }: { pct: number; locale: AppLocale }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <svg viewBox="0 0 80 80" width={76} height={76} fill="none" className="shrink-0" aria-hidden="true">
      <circle cx="40" cy="40" r={RADIUS} fill="none" stroke="currentColor" strokeWidth="9" className="text-white/10" />
      <circle
        cx="40"
        cy="40"
        r={RADIUS}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        transform="rotate(-90 40 40)"
      />
      <text
        x="40"
        y="45"
        textAnchor="middle"
        className="fill-white font-mono text-[18px] font-semibold"
      >
        {formatNumber(clamped, locale)}%
      </text>
    </svg>
  );
}
