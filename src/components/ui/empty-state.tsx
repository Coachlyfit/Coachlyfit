import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApertureSweep } from "@/components/brand/aperture-sweep";

/** "No results." tells a coach nothing about WHY — under a source filter it
 * is indistinguishable from a broken page. Every caller passes a message
 * that names the active filter, and an action that gets the user out of the
 * dead end (widen the filter, or create the thing they searched for).
 *
 * `brandMark` opts into the identity motion spec's empty-state trigger: the
 * aperture sweep at 64px, muted arc / full-strength dot ("the one place the
 * dot outranks the arc, because the point is what's missing"), playing once
 * on mount. Mutually exclusive with `icon` — callers pick one. */
export function EmptyState({
  icon: Icon,
  brandMark = false,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  brandMark?: boolean;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 py-10 text-center", className)}>
      {brandMark ? (
        <ApertureSweep size={64} className="text-muted-foreground/40" />
      ) : (
        Icon && <Icon className="size-8 text-muted-foreground/60" aria-hidden="true" />
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
