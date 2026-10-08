import { Apple, CalendarCheck, ClipboardList, Dumbbell, FileText, type LucideIcon } from "lucide-react";
import type { FormKind } from "@/domain/forms/schema";

/** One icon + one tint per form kind, shared by the list, the new-form page
 * and the builder so a kind looks the same everywhere. Never the only
 * signal: every use sits next to the kind's text label. */
export const KIND_META: Record<FormKind, { icon: LucideIcon; tint: string }> = {
  intake: { icon: ClipboardList, tint: "bg-accent-tint text-accent-tint-foreground" },
  checkin: { icon: CalendarCheck, tint: "bg-success-tint text-success-tint-foreground" },
  workout: { icon: Dumbbell, tint: "bg-info-tint text-info-tint-foreground" },
  diet: { icon: Apple, tint: "bg-warning-tint text-warning-tint-foreground" },
  custom: { icon: FileText, tint: "bg-muted text-foreground" },
};

export function kindMeta(kind: string) {
  return KIND_META[kind as FormKind] ?? KIND_META.custom;
}
