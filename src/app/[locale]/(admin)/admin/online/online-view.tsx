"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OnlineSummary } from "@/domain/presence/presence.service";
import type { AppLocale } from "@/domain/locale";
import { getOnlineSummaryAction } from "./actions";
import { ClientsPanel } from "./clients-panel";
import { DotAvatar, SeenText, STATUS_DOT, num } from "./online-bits";
import { useOnlinePresence } from "./use-online-presence";

const QUERY_ROOT = ["admin-online"] as const;
// Same cadence as the heartbeat that writes last_seen_at: the presence
// events below cover joins and leaves, this catches the day rolling over.
const SUMMARY_REFETCH_MS = 60_000;

const CARD = "flex flex-col gap-0.5 rounded-xl p-3 leading-snug lg:gap-1 lg:p-4.5";
const PLAIN = "bg-card ring-1 ring-foreground/10";
const FIGURE = "font-mono text-2xl leading-8 font-semibold tabular-nums";
const NOTE = "text-xs lg:text-sm";

/** Who is online comes from the presence channel (onlineIds), everything
 * else from two small queries: the aggregate summary, and the selected
 * coach's clients (in ClientsPanel). A presence change re-derives every
 * count on the page in place and marks both queries stale so last-seen and
 * the today / 7-day figures catch up -- the page itself never reloads. */
export function OnlineView({ locale, initialSummary }: { locale: AppLocale; initialSummary: OnlineSummary }) {
  const t = useTranslations("admin.online");
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { onlineIds, connected } = useOnlinePresence();
  const [query, setQuery] = useState("");

  const { data: summary } = useQuery({
    queryKey: [...QUERY_ROOT, "summary"],
    queryFn: () => getOnlineSummaryAction(),
    initialData: initialSummary,
    refetchInterval: SUMMARY_REFETCH_MS,
  });

  // ponytail: one refetch per presence sync, unthrottled. Fine while joins
  // and leaves are a few a minute; throttle here if that stops being true.
  useEffect(() => {
    if (connected) void queryClient.invalidateQueries({ queryKey: QUERY_ROOT });
  }, [onlineIds, connected, queryClient]);

  const coaches = useMemo(
    () =>
      summary.coaches.map((c) => ({
        ...c,
        online: onlineIds.has(c.id),
        clientsOnline: c.clientUserIds.filter((id) => onlineIds.has(id)).length,
      })),
    [summary.coaches, onlineIds]
  );

  const coachesOnline = coaches.filter((c) => c.online).length;
  const clientsOnline = coaches.reduce((sum, c) => sum + c.clientsOnline, 0);
  const totalUsers = summary.coachTotal + summary.clientTotal;
  const weekPct = totalUsers > 0 ? Math.round((summary.active7d / totalUsers) * 100) : 0;

  const selected = coaches.find((c) => c.id === searchParams.get("coach")) ?? coaches[0];

  // Native history API: updates ?coach= (and useSearchParams) without
  // re-running the server page, which would refetch the summary.
  function selectCoach(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("coach", id);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  const q = query.trim().toLowerCase();
  const listed = q ? coaches.filter((c) => c.name.toLowerCase().includes(q)) : coaches;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p role="status" className="flex items-center gap-1.5 text-muted-foreground">
          <span
            className={cn("size-2 rounded-full", connected ? "bg-success" : "bg-muted-foreground/40")}
            aria-hidden="true"
          />
          {connected ? t("live") : t("connecting")}
        </p>
      </header>

      <section aria-label={t("cards.label")} className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        <div className={cn(CARD, "bg-success-tint text-success-tint-foreground lg:bg-card lg:text-foreground lg:ring-1 lg:ring-foreground/10")}>
          <span className="lg:text-muted-foreground">{t("cards.online")}</span>
          <span className={cn(FIGURE, "lg:text-success-tint-foreground")}>
            {formatNumber(coachesOnline + clientsOnline, locale)}
          </span>
          <span className={cn(NOTE, "lg:text-muted-foreground")}>
            {t.rich("cards.onlineSplit", {
              coaches: formatNumber(coachesOnline, locale),
              clients: formatNumber(clientsOnline, locale),
              num,
            })}
          </span>
        </div>
        <div className={cn(CARD, PLAIN)}>
          <span className="text-muted-foreground">{t("cards.today")}</span>
          <span className={FIGURE}>{formatNumber(summary.activeToday, locale)}</span>
          <span className={cn(NOTE, "text-muted-foreground")}>
            {t.rich("cards.todayOf", { total: formatNumber(totalUsers, locale), num })}
          </span>
        </div>
        <div className={cn(CARD, PLAIN)}>
          <span className="text-muted-foreground">{t("cards.week")}</span>
          <span className={FIGURE}>{formatNumber(summary.active7d, locale)}</span>
          <span className={cn(NOTE, "text-muted-foreground")}>
            {t.rich("cards.weekPct", { pct: formatNumber(weekPct, locale), num })}
          </span>
        </div>
        <div className={cn(CARD, "bg-warning-tint text-warning-tint-foreground")}>
          <span>{t("cards.never")}</span>
          <span className={FIGURE}>{formatNumber(summary.neverCount, locale)}</span>
          <span className={NOTE}>{t("cards.neverNote")}</span>
        </div>
      </section>

      {!selected ? (
        <EmptyState icon={Radio} title={t("empty.noCoaches")} />
      ) : (
        <>
          <div className="flex flex-col gap-2 lg:hidden">
            <h2 className="text-base font-semibold">{t("coaches.title")}</h2>
            <div role="group" aria-label={t("coaches.title")} className="flex gap-2 overflow-x-auto pb-1">
              {coaches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={c.id === selected.id}
                  onClick={() => selectCoach(c.id)}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-card py-1.5 ps-2 pe-3 ring-1 ring-foreground/10 outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring",
                    c.id === selected.id && "ring-2 ring-primary"
                  )}
                >
                  <DotAvatar id={c.id} name={c.name} size="default" dot={c.online && STATUS_DOT.online} />
                  <span className="font-medium whitespace-nowrap">{c.name}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {formatNumber(c.clientsOnline, locale)}/{formatNumber(c.clientTotal, locale)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <section
              aria-labelledby="online-coaches-heading"
              className="hidden w-80 shrink-0 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:block"
            >
              <div className="flex flex-col gap-2 border-b border-border p-3.5 pb-2.5">
                <h2 id="online-coaches-heading" className="text-lg font-semibold">
                  {t("coaches.title")}
                </h2>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("coaches.search")}
                    aria-label={t("coaches.search")}
                    className="h-10 ps-8"
                  />
                </div>
              </div>
              {listed.length === 0 ? (
                <EmptyState title={t("coaches.noResults")} className="py-6" />
              ) : (
                <ul className="p-1.5">
                  {listed.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-current={c.id === selected.id ? "true" : undefined}
                        onClick={() => selectCoach(c.id)}
                        className={cn(
                          "flex min-h-14 w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-start outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                          c.id === selected.id && "bg-accent-tint hover:bg-accent-tint"
                        )}
                      >
                        <DotAvatar id={c.id} name={c.name} dot={c.online && STATUS_DOT.online} />
                        <span className="flex min-w-0 flex-1 flex-col leading-snug">
                          <span className="truncate font-semibold">{c.name}</span>
                          <span className="text-[0.8125rem] text-muted-foreground">
                            <SeenText lastSeenAt={c.lastSeenAt} present={c.online} locale={locale} />
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end leading-tight">
                          <span
                            className={cn(
                              "font-mono font-semibold tabular-nums",
                              c.clientsOnline > 0 ? "text-success-tint-foreground" : "text-muted-foreground"
                            )}
                          >
                            {formatNumber(c.clientsOnline, locale)}
                            <span className="font-medium text-muted-foreground">/{formatNumber(c.clientTotal, locale)}</span>
                          </span>
                          <span className="text-[0.6875rem] text-muted-foreground">{t("coaches.onlineLabel")}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <ClientsPanel key={selected.id} locale={locale} coach={selected} onlineIds={onlineIds} />
          </div>
        </>
      )}
    </div>
  );
}
