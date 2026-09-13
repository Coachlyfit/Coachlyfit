"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { List, LayoutGrid, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import type { AppLocale } from "@/domain/locale";
import type { InboxThread } from "@/domain/messages/messages.service";
import { ThreadCard } from "./thread-card";

type Filter = "all" | "unread";
type View = "list" | "grid";

const VIEW_STORAGE_KEY = "inbox:view";

function readStoredView(): View {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

export function InboxList({ threads, locale }: { threads: InboxThread[]; locale: AppLocale }) {
  const t = useTranslations("inbox");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("list");

  // Read the persisted view after mount so server and first client render
  // match (avoids a hydration mismatch from reading localStorage eagerly).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage, an external system with no server-side value; effect is the correct place to read it
  useEffect(() => setView(readStoredView()), []);

  function handleViewChange(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // best-effort persistence only
    }
  }

  const totalUnread = useMemo(() => threads.reduce((sum, th) => sum + (th.unread_count > 0 ? 1 : 0), 0), [threads]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads
      .filter((th) => filter === "all" || th.unread_count > 0)
      .filter((th) => !q || th.display_name.toLowerCase().includes(q) || th.last_body?.toLowerCase().includes(q));
  }, [threads, query, filter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} className="ps-9" />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          label={t("title")}
          options={[
            { value: "all", label: t("filter.all") },
            { value: "unread", label: t("filter.unread") },
          ]}
        />
        <Segmented
          value={view}
          onChange={handleViewChange}
          label={t("view.label")}
          options={[
            { value: "list", label: t("view.list"), icon: List },
            { value: "grid", label: t("view.grid"), icon: LayoutGrid },
          ]}
        />
        {totalUnread > 0 && (
          <span className="ms-auto font-mono text-xs text-muted-foreground">
            {t("unreadCount", { count: totalUnread })}
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState brandMark title={t("noResults")} />
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((thread) => (
            <ThreadCard key={thread.client_id} thread={thread} locale={locale} view="grid" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((thread) => (
            <ThreadCard key={thread.client_id} thread={thread} locale={locale} view="list" />
          ))}
        </div>
      )}
    </div>
  );
}
