"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { supportUnreadCountAction } from "@/domain/support/support-actions";

export const SUPPORT_UNREAD_KEY = ["support-unread"] as const;

// Support is minutes-scale, so a poll is enough; no realtime channel.
const REFETCH_MS = 60_000;

function useSupportUnread() {
  const { data = 0 } = useQuery({
    queryKey: SUPPORT_UNREAD_KEY,
    queryFn: () => supportUnreadCountAction(),
    refetchInterval: REFETCH_MS,
  });
  return data;
}

/** Tickets with something the viewer hasn't read, for the "support" nav item
 * on either side. Renders nothing at zero. */
export function SupportUnreadBadge({ className }: { className?: string }) {
  const t = useTranslations("support");
  const total = useSupportUnread();
  if (total === 0) return null;

  return (
    <span
      aria-label={t("unreadCount", { count: total })}
      className={cn(
        "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-xs tabular-nums text-primary-foreground",
        className,
      )}
    >
      {total > 99 ? "99+" : total}
    </span>
  );
}

/** Count-less variant for the mobile "more" tab, when the support item sits
 * behind its sheet. */
export function SupportUnreadDot({ className }: { className?: string }) {
  const t = useTranslations("support");
  const total = useSupportUnread();
  if (total === 0) return null;

  return (
    <span
      role="img"
      aria-label={t("unreadCount", { count: total })}
      className={cn("size-2 rounded-full bg-primary", className)}
    />
  );
}
