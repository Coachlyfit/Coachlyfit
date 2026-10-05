import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONE = {
  success: "bg-success-tint text-success-tint-foreground",
  warning: "bg-warning-tint text-warning-tint-foreground",
  destructive: "bg-destructive-tint text-destructive-tint-foreground",
  accent: "bg-accent-tint text-accent-tint-foreground",
} as const;

export type StatusTone = keyof typeof TONE;

/** Status pill on a tint pair (design system §06). Lives outside ui/ because
 * the vendored Badge has no destructive-tint variant. Color is never the
 * only signal -- children must be a text label. */
export function StatusBadge({
  tone,
  className,
  children,
}: {
  tone: StatusTone;
  className?: string;
  children: React.ReactNode;
}) {
  return <Badge className={cn("rounded-md", TONE[tone], className)}>{children}</Badge>;
}
