"use client";

import { useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, Clock } from "lucide-react";
import type { ConsentStatus } from "@/domain/sites/results.service";
import { cn } from "@/lib/utils";

const STYLE: Record<ConsentStatus, string> = {
  agreed: "bg-success-tint text-success-tint-foreground",
  pending: "bg-warning-tint text-warning-tint-foreground",
  withdrawn: "bg-destructive/10 text-destructive",
};

const ICON = { agreed: CircleCheck, pending: Clock, withdrawn: CircleAlert } as const;

/** Client agreed / Waiting for consent / Client withdrew. Icon + text, never
 * color alone. */
export function ConsentStatusPill({ status }: { status: ConsentStatus }) {
  const t = useTranslations("websiteEditor.results.status");
  const Icon = ICON[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium", STYLE[status])}>
      <Icon className="size-3.5" aria-hidden="true" />
      {t(status)}
    </span>
  );
}
