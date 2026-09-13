"use client";

import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { tintFor } from "@/lib/tint";
import { formatRelativeTime } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { InboxThread } from "@/domain/messages/messages.service";
import { cn } from "@/lib/utils";

/** One conversation row/tile — same card for list and grid layout, InboxList
 * only changes the wrapping grid/flex container around it. */
export function ThreadCard({ thread, locale, view }: { thread: InboxThread; locale: AppLocale; view: "list" | "grid" }) {
  const t = useTranslations("inbox");
  const unread = thread.unread_count > 0;

  return (
    <Link href={`/inbox/${thread.client_id}`}>
      <Card
        className={cn(
          "border-s-2 border-s-transparent py-3 transition-colors hover:bg-muted/50",
          unread && "border-s-primary",
          view === "grid" && "h-full",
        )}
      >
        <CardContent className={cn("flex gap-3", view === "grid" ? "flex-col" : "items-center")}>
          <div className={cn("flex items-center gap-3", view === "grid" && "justify-between")}>
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
                tintFor(thread.client_id),
              )}
              aria-hidden="true"
            >
              {thread.display_name[0]}
            </div>
            {view === "grid" && unread && (
              <Badge aria-label={t("unreadCount", { count: thread.unread_count })}>{thread.unread_count}</Badge>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className={cn("truncate", unread ? "font-semibold" : "font-medium")}>{thread.display_name}</span>
              {thread.last_message_at && (
                <time
                  dateTime={thread.last_message_at}
                  className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
                >
                  {formatRelativeTime(thread.last_message_at, locale)}
                </time>
              )}
            </div>
            <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
              {!thread.last_body ? (
                <>
                  <MessageCircle className="size-3.5 shrink-0" aria-hidden="true" />
                  {t("noMessages")}
                </>
              ) : (
                <>
                  {thread.last_sender_role === "coach" && `${t("you")} `}
                  {thread.last_body}
                </>
              )}
            </p>
          </div>

          {view === "list" && unread && (
            <Badge className="shrink-0" aria-label={t("unreadCount", { count: thread.unread_count })}>
              {thread.unread_count}
            </Badge>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
