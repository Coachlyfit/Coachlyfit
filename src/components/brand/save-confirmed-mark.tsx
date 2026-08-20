"use client";

import { cn } from "@/lib/utils";
import { ApertureSweep } from "./aperture-sweep";

/**
 * The motion spec's "Save confirmed" trigger (section 03): mark at 24px —
 * the identity spec's own floor ("never run it below 24px... reads as a
 * rendering glitch") — next to a "Saved" label, next to the save button.
 *
 * NOT wired into any save flow yet. The spec is explicit that this
 * *replaces* a toast ("don't run both"), and every existing save path in
 * this app (e.g. `fill-form-client.tsx`'s `submitFormAction` /
 * `toast.error`) currently has no success toast to remove — so there's no
 * mechanical swap to make. Wiring this in is a per-flow UX decision (does
 * this save surface get inline confirmation or does it keep redirecting/
 * toasting?), not something to guess at silently. Drop this component next
 * to a save button once that call is made:
 *
 *   <SaveConfirmedMark show={justSaved} label={t("saved")} />
 */
export function SaveConfirmedMark({
  show,
  label,
  className,
}: {
  show: boolean;
  label: string;
  className?: string;
}) {
  if (!show) return null;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ApertureSweep size={24} />
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  );
}
