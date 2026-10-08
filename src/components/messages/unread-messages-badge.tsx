"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useInboxRealtime, useInboxThreads } from "./use-inbox-threads";

function useTotalUnread() {
  return useInboxThreads().reduce((sum, thread) => sum + thread.unread_count, 0);
}

/** Total unread client messages, for the "messages" nav item. Renders
 * nothing at zero. */
export function UnreadMessagesBadge({ className }: { className?: string }) {
  const t = useTranslations("inbox");
  const total = useTotalUnread();
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

/** Count-less variant for the mobile "more" tab, which hides the messages
 * item behind a sheet. */
export function UnreadMessagesDot({ className }: { className?: string }) {
  const t = useTranslations("inbox");
  const total = useTotalUnread();
  if (total === 0) return null;

  return (
    <span
      role="img"
      aria-label={t("unreadCount", { count: total })}
      className={cn("size-2 rounded-full bg-primary", className)}
    />
  );
}

/** Mounted once in the coach layout so unread counts stay live on every
 * page, not only while the messages page is open. */
export function InboxRealtime() {
  useInboxRealtime();
  return null;
}
