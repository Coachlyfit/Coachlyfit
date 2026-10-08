"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useClientPresence } from "@/components/messages/use-inbox-threads";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { InboxThread } from "@/domain/messages/messages.service";

type Filter = "all" | "unread" | "awaitingRead";
const FILTERS: Filter[] = ["all", "unread", "awaitingRead"];

/** Clock time for today's messages, day.month for anything older. */
function formatThreadTime(value: string, locale: AppLocale) {
  const sameDay = new Date(value).toDateString() === new Date().toDateString();
  return sameDay
    ? formatDate(value, locale, { timeStyle: "short", dateStyle: undefined })
    : formatDate(value, locale, { day: "2-digit", month: "2-digit" });
}

export function ConversationList({
  threads,
  selectedId,
  locale,
  className,
}: {
  threads: InboxThread[];
  selectedId: string | null;
  locale: AppLocale;
  className?: string;
}) {
  const t = useTranslations("inbox");
  const presence = useClientPresence();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const unreadThreads = useMemo(() => threads.filter((th) => th.unread_count > 0).length, [threads]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads
      .filter((th) => filter === "all" || (filter === "unread" ? th.unread_count > 0 : th.awaiting_read))
      .filter((th) => !q || th.display_name.toLowerCase().includes(q) || th.last_body?.toLowerCase().includes(q));
  }, [threads, query, filter]);

  return (
    <section aria-label={t("conversations")} className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("searchLabel")}
            placeholder={t("search")}
            className="ps-9 text-base lg:text-sm"
          />
        </div>
        <div role="group" aria-label={t("filter.label")} className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "h-8.5 flex-1 rounded-md px-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                filter === value ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`filter.${value}`)}
              {value === "unread" && unreadThreads > 0 && (
                <span className="font-mono tabular-nums"> · {unreadThreads}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {threads.length === 0 ? (
        <EmptyState icon={MessageCircle} title={t("clientList.empty")} className="flex-1 justify-center" />
      ) : shown.length === 0 ? (
        <EmptyState brandMark title={t("noResults")} className="flex-1 justify-center" />
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {shown.map((thread) => (
            <li key={thread.client_id}>
              <ConversationRow
                thread={thread}
                selected={thread.client_id === selectedId}
                online={presence[thread.client_id]?.online ?? false}
                locale={locale}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ConversationRow({
  thread,
  selected,
  online,
  locale,
}: {
  thread: InboxThread;
  selected: boolean;
  online: boolean;
  locale: AppLocale;
}) {
  const t = useTranslations("inbox");
  const unread = thread.unread_count > 0;

  return (
    // A link, not a button: opening a conversation is a navigation (the
    // selected thread lives in the URL), so it gets prefetch, middle-click
    // and aria-current for free.
    <Link
      href={`/messages/${thread.client_id}`}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-lg p-2.5 text-start transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected ? "bg-accent-tint" : "hover:bg-muted/60",
      )}
    >
      <span className="relative shrink-0">
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-full font-semibold text-white",
            tintFor(thread.client_id),
          )}
          aria-hidden="true"
        >
          {thread.display_name[0]}
        </span>
        {online && (
          <span
            role="img"
            aria-label={t("online")}
            className="absolute end-0 bottom-0 size-3 rounded-full bg-success ring-2 ring-card"
          />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate", unread ? "font-bold" : "font-medium")}>{thread.display_name}</span>
          {thread.last_message_at && (
            <time
              dateTime={thread.last_message_at}
              // Formatted in the viewer's timezone, which the server render can't know.
              suppressHydrationWarning
              className={cn(
                "shrink-0 font-mono text-xs tabular-nums",
                unread ? "text-primary" : "text-muted-foreground",
              )}
            >
              {formatThreadTime(thread.last_message_at, locale)}
            </time>
          )}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-sm", unread ? "font-semibold" : "text-muted-foreground")}>
            {!thread.last_body
              ? t("noMessages")
              : thread.last_sender_role === "coach"
                ? `${t("you")} ${thread.last_body}`
                : thread.last_body}
          </span>
          {unread && (
            <span
              aria-label={t("unreadCount", { count: thread.unread_count })}
              className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-xs tabular-nums text-primary-foreground"
            >
              {thread.unread_count}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
