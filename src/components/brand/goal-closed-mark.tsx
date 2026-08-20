"use client";

import { ApertureSweep } from "./aperture-sweep";

/**
 * The motion spec's "Client closes a goal" trigger (section 03) — "the
 * on-message one — a client has literally gone past the arc." Mark at 36px
 * next to a feed-style notification line, fired "at most once per client
 * per day," never batch-animated across a list.
 *
 * NOT wired into any feed yet: `src/domain/progress` and
 * `src/domain/notifications` have no "goal" concept (checked — no
 * goal/closeGoal/completeGoal anywhere in the domain layer). The spec's own
 * mockup ("سارة أغلقت هدف الأسبوع") is aspirational UI for a feature that
 * doesn't exist in this codebase, not something to invent silently while
 * implementing a motion spec. Drop this next to the notification/feed item
 * once that feature lands:
 *
 *   <GoalClosedMark title={t("goalClosed", { name })} subtitle={detail} />
 */
export function GoalClosedMark({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        <ApertureSweep size={36} className="shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}
