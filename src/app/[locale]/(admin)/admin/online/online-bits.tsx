"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { ClientAvatar } from "@/app/[locale]/(coach)/dashboard/client-avatar";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { daysSince, type PresenceStatus } from "@/domain/presence/presence-status";
import type { AppLocale } from "@/domain/locale";

/** Shared pieces of the "Online now" page, so the coach list, the clients
 * table and the mobile lists show the same dot, badge and wording. */

export const num = (chunks: React.ReactNode) => <span className="font-mono tabular-nums">{chunks}</span>;

export const STATUS_DOT: Record<PresenceStatus, string> = {
  online: "bg-success",
  offline: "bg-muted-foreground/50",
  inactive: "bg-warning",
  never: "bg-destructive",
};

export const STATUS_TEXT: Record<PresenceStatus, string> = {
  online: "text-success-tint-foreground",
  offline: "text-muted-foreground",
  inactive: "text-warning-tint-foreground",
  never: "text-destructive-tint-foreground",
};

const STATUS_TONE: Record<Exclude<PresenceStatus, "offline">, StatusTone> = {
  online: "success",
  inactive: "warning",
  never: "destructive",
};

export function PresenceBadge({ status }: { status: PresenceStatus }) {
  const t = useTranslations("admin.online.status");
  const content = (
    <>
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden="true" />
      {t(status)}
    </>
  );
  if (status === "offline") {
    return (
      <Badge variant="secondary" className="gap-1.5 rounded-md">
        {content}
      </Badge>
    );
  }
  return (
    <StatusBadge tone={STATUS_TONE[status]} className="gap-1.5">
      {content}
    </StatusBadge>
  );
}

/** Avatar with a status dot on its corner. The dot is decorative: every
 * place that uses it also states the status in text. */
export function DotAvatar({
  id,
  name,
  dot,
  size,
}: {
  id: string;
  name: string;
  dot?: string | false;
  size?: "default" | "lg";
}) {
  return (
    <span className="relative shrink-0">
      <ClientAvatar id={id} name={name} size={size} />
      {dot && (
        <span className={cn("absolute -end-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card", dot)} aria-hidden="true" />
      )}
    </span>
  );
}

/** "Online now" / "3 hours ago" / "17 days ago" / "Never logged in".
 * formatRelativeTime switches to a plain date after a week; here the page
 * is about how long someone has been away, so it keeps counting days. */
export function SeenText({
  lastSeenAt,
  present,
  locale,
}: {
  lastSeenAt: string | null;
  present: boolean;
  locale: AppLocale;
}) {
  const t = useTranslations("admin.online.seen");
  if (present) return t("online");
  if (!lastSeenAt) return t("never");
  const days = daysSince(lastSeenAt);
  if (days < 7) return formatRelativeTime(lastSeenAt, locale);
  return t.rich("daysAgo", { count: days, value: formatNumber(days, locale), num });
}
