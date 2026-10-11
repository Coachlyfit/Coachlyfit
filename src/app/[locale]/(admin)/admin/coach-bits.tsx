"use client";

import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { ClientAvatar } from "@/app/[locale]/(coach)/dashboard/client-avatar";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CoachStage } from "@/domain/billing/coach-stage";
import type { AppLocale } from "@/domain/locale";
import { RecordPaymentDialog } from "./record-payment-dialog";
import type { CoachView } from "./types";

/** Shared pieces of a coach row, so list, cards and kanban render the same
 * badge, note and action for the same coach. */

const num = (chunks: React.ReactNode) => <span className="font-mono tabular-nums">{chunks}</span>;

const PLAN_TINT: Record<string, string> = {
  starter: "bg-accent-tint text-accent-tint-foreground",
  pro: "bg-info-tint text-info-tint-foreground",
  elite: "bg-success-tint text-success-tint-foreground",
};

const PLAN_KEYS = ["starter", "pro", "elite"] as const;
type PlanKey = (typeof PLAN_KEYS)[number];

export function CoachAvatar({ coach, size }: { coach: CoachView; size?: "default" | "lg" }) {
  return <ClientAvatar id={coach.id} name={coach.name} size={size} />;
}

export function PlanBadge({ tier }: { tier: string | null }) {
  const t = useTranslations("admin.coaches.segments");
  if (!tier || !PLAN_KEYS.includes(tier as PlanKey)) {
    return <Badge variant="secondary" className="rounded-md">—</Badge>;
  }
  return (
    <Badge dir="ltr" className={cn("rounded-md font-semibold", PLAN_TINT[tier])}>
      {t(tier as PlanKey)}
    </Badge>
  );
}

const STAGE_TONE: Record<Exclude<CoachStage, "cancelled">, StatusTone> = {
  trial: "warning",
  active: "success",
  pastDue: "destructive",
};

export const STAGE_DOT: Record<CoachStage, string> = {
  trial: "bg-warning",
  active: "bg-success",
  pastDue: "bg-destructive",
  cancelled: "bg-muted-foreground/50",
};

export function StageBadge({ stage }: { stage: CoachStage | null }) {
  const t = useTranslations("admin.coaches.stage");
  if (!stage) return <span className="text-muted-foreground">—</span>;
  if (stage === "cancelled") {
    return <Badge variant="secondary" className="rounded-md">{t(stage)}</Badge>;
  }
  return <StatusBadge tone={STAGE_TONE[stage]}>{t(stage)}</StatusBadge>;
}

const NOTE_COLOR = {
  overdue: "text-destructive-tint-foreground",
  trialEnds: "text-warning-tint-foreground",
  inactive: "text-warning-tint-foreground",
  renews: "text-muted-foreground",
  cancelledAgo: "text-muted-foreground",
} as const;

export function CoachNoteText({
  coach,
  locale,
  className,
}: {
  coach: CoachView;
  locale: AppLocale;
  className?: string;
}) {
  const t = useTranslations("admin.coaches.note");
  if (!coach.note) return null;
  return (
    <span className={cn("text-[0.8125rem]", NOTE_COLOR[coach.note.kind], className)}>
      {t.rich(coach.note.kind, { count: coach.note.days, value: formatNumber(coach.note.days, locale), num })}
    </span>
  );
}

export function Amount({ value, locale, className }: { value: number | null; locale: AppLocale; className?: string }) {
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {value != null && value > 0 ? formatNumber(value, locale) : "—"}
    </span>
  );
}

// ponytail: assumes Egyptian mobiles (01xxxxxxxxx -> 201xxxxxxxxx); numbers
// already in international form pass through. Add a real phone parser if
// coaches outside Egypt sign up.
export function whatsappUrl(phone: string | null): string | null {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = `2${digits}`;
  return digits.length >= 10 ? `https://wa.me/${digits}` : null;
}

/** Past due -> record payment, trial / gone-quiet -> WhatsApp, cancelled ->
 * win back (record_payment() reactivates the subscription). Renders nothing
 * when the stage has no next step or the coach has no phone to message. */
export function CoachAction({
  coach,
  locale,
  className,
}: {
  coach: CoachView;
  locale: AppLocale;
  className?: string;
}) {
  const t = useTranslations("admin.coaches");

  if (coach.stage === "pastDue" || coach.stage === "cancelled") {
    return (
      <RecordPaymentDialog
        locale={locale}
        coachId={coach.id}
        label={coach.stage === "pastDue" ? t("recordPayment") : t("actions.winBack")}
        defaultAmount={coach.amount ?? undefined}
        className={className}
      />
    );
  }

  const quiet = coach.note?.kind === "inactive";
  const url = coach.stage === "trial" || quiet ? whatsappUrl(coach.phone) : null;
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), className)}
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      {quiet ? t("actions.checkIn") : t("actions.contact")}
    </a>
  );
}
