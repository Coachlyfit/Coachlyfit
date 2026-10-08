"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle, MoreHorizontal, Search, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SubscriptionRosterStatus } from "@/domain/billing/client-subscription";
import type { AppLocale } from "@/domain/locale";
import type { ClientCheckinStatus } from "@/domain/progress/stats";
import { ClientAvatar } from "../dashboard/client-avatar";
import { RegenerateInviteButton } from "./regenerate-invite-button";
import { STATUS_FILTERS, type StatusFilter } from "./schemas";

export type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  invited: boolean;
  program: string | null;
  lastCheckin: string | null;
  daysAgo: number | null;
  adherence: number | null;
  // "archived" is the client's own state, not a check-in status: it fits
  // none of the three rules, so it's listed under "all" only.
  checkinStatus: ClientCheckinStatus | "archived";
  subscription: SubscriptionRosterStatus;
};

const CARD_DOT: Record<StatusFilter, string> = {
  all: "bg-muted-foreground",
  active: "bg-success",
  late: "bg-warning",
  awaiting: "bg-primary",
};

const CHECKIN_TONE: Record<ClientCheckinStatus, StatusTone> = {
  active: "success",
  late: "warning",
  awaiting: "accent",
};

// canceled / none have no tone: nothing to act on, so they stay neutral.
const SUBSCRIPTION_TONE: Partial<Record<SubscriptionRosterStatus, StatusTone>> = {
  active: "success",
  renewsSoon: "warning",
  expired: "destructive",
  frozen: "accent",
};

const ADHERENCE_WARNING_BELOW = 50;

const ALL_PROGRAMS = "__all__";
const NO_PROGRAM = "__none__";

const SORTS = ["lastCheckin", "name", "adherence"] as const;
type Sort = (typeof SORTS)[number];

function mono(chunks: React.ReactNode) {
  return <span className="font-mono tabular-nums">{chunks}</span>;
}

export function ClientsTable({
  locale,
  clients,
  status,
}: {
  locale: AppLocale;
  clients: ClientRow[];
  status: StatusFilter;
}) {
  const t = useTranslations("clients");
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  // The URL (?status=) is the source of truth; optimistic so the cards and
  // rows switch on click instead of after the server round trip.
  const [filter, setFilter] = useOptimistic(status);
  const [query, setQuery] = useState("");
  const [program, setProgram] = useState(ALL_PROGRAMS);
  const [sort, setSort] = useState<Sort>("lastCheckin");

  function pickStatus(next: StatusFilter) {
    startTransition(() => {
      setFilter(next);
      router.replace(next === "all" ? pathname : `${pathname}?status=${next}`, { scroll: false });
    });
  }

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = { all: clients.length, active: 0, late: 0, awaiting: 0 };
    for (const c of clients) if (c.checkinStatus !== "archived") result[c.checkinStatus]++;
    return result;
  }, [clients]);

  const programOptions = useMemo(() => {
    const names = [...new Set(clients.map((c) => c.program).filter((p): p is string => p != null))].sort((a, b) =>
      a.localeCompare(b, locale)
    );
    return [
      { value: ALL_PROGRAMS, label: t("toolbar.programAll") },
      ...names.map((name) => ({ value: name, label: name })),
      { value: NO_PROGRAM, label: t("noProgram") },
    ];
  }, [clients, locale, t]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients
      .filter((c) => filter === "all" || c.checkinStatus === filter)
      .filter((c) => program === ALL_PROGRAMS || (program === NO_PROGRAM ? c.program == null : c.program === program))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.email?.toLowerCase().includes(q) ?? false))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, locale);
        // No value sorts last either way: most recent check-in first,
        // lowest adherence first.
        if (sort === "adherence") return (a.adherence ?? Infinity) - (b.adherence ?? Infinity);
        return (a.daysAgo ?? Infinity) - (b.daysAgo ?? Infinity);
      });
  }, [clients, filter, program, query, sort, locale]);

  const noData = <span className="text-muted-foreground">{t("noData")}</span>;

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label={t("cardsLabel")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATUS_FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => pickStatus(key)}
            className="flex flex-col gap-1 rounded-xl bg-card px-4 py-3.5 text-start ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:ring-2 aria-pressed:ring-primary"
          >
            <span className="flex items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", CARD_DOT[key])} aria-hidden="true" />
              <span className="font-medium">{t(`cards.${key}`)}</span>
            </span>
            <span className="font-mono text-2xl leading-8 font-semibold tabular-nums">
              {formatNumber(counts[key], locale)}
            </span>
          </button>
        ))}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3.5">
          <div className="relative min-w-0 flex-[1_1_260px]">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="ps-9"
            />
          </div>
          <Select value={program} onValueChange={(v) => setProgram(v as string)} items={programOptions}>
            <SelectTrigger aria-label={t("table.program")}>
              <SelectValue>
                {(v: string) =>
                  t("toolbar.program", { value: programOptions.find((o) => o.value === v)?.label ?? "" })
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {programOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(v) => setSort(v as Sort)}
            items={SORTS.map((s) => ({ value: s, label: t(`toolbar.sortBy.${s}`) }))}
          >
            <SelectTrigger aria-label={t("toolbar.sortLabel")}>
              <SelectValue>{(v: Sort) => t("toolbar.sort", { value: t(`toolbar.sortBy.${v}`) })}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`toolbar.sortBy.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.client")}</TableHead>
              <TableHead>{t("table.program")}</TableHead>
              <TableHead>{t("table.lastCheckin")}</TableHead>
              <TableHead>{t("table.adherence")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.subscription")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("table.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((client) => {
              const subscriptionTone = SUBSCRIPTION_TONE[client.subscription];
              return (
                <TableRow key={client.id}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <ClientAvatar id={client.id} name={client.name} />
                      <div className="flex min-w-0 flex-col">
                        <Link href={`/clients/${client.id}`} className="truncate font-medium hover:underline">
                          {client.name}
                        </Link>
                        {client.email && (
                          <span dir="ltr" className="truncate text-start text-muted-foreground">
                            {client.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {client.program ?? <span className="text-muted-foreground">{t("noProgram")}</span>}
                  </TableCell>
                  <TableCell>
                    {client.lastCheckin == null || client.daysAgo == null ? (
                      noData
                    ) : (
                      <div className="flex flex-col">
                        <span>
                          {t.rich("lastCheckin", {
                            count: client.daysAgo,
                            value: formatNumber(client.daysAgo, locale),
                            num: mono,
                          })}
                        </span>
                        <span className="font-mono text-muted-foreground tabular-nums">
                          {formatDate(client.lastCheckin, locale, { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {client.adherence == null ? (
                      noData
                    ) : (
                      <div className="flex items-center gap-2">
                        {/* A flex row starts at the inline-start edge, so the
                            fill grows from the right in RTL without a
                            direction-specific class. */}
                        <div className="flex h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              client.adherence < ADHERENCE_WARNING_BELOW ? "bg-warning" : "bg-primary"
                            )}
                            style={{ width: `${client.adherence}%` }}
                          />
                        </div>
                        <span className="font-mono tabular-nums">{formatNumber(client.adherence, locale)}%</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {client.checkinStatus === "archived" ? (
                      <Badge variant="secondary" className="rounded-md">
                        {t("status.archived")}
                      </Badge>
                    ) : (
                      <StatusBadge tone={CHECKIN_TONE[client.checkinStatus]}>
                        {t(`checkinStatus.${client.checkinStatus}`)}
                      </StatusBadge>
                    )}
                  </TableCell>
                  <TableCell>
                    {subscriptionTone ? (
                      <StatusBadge tone={subscriptionTone}>{t(`subscription.${client.subscription}`)}</StatusBadge>
                    ) : (
                      <Badge variant="secondary" className="rounded-md">
                        {t(`subscription.${client.subscription}`)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/messages/${client.id}`}
                        className={buttonVariants({ variant: "ghost", size: "icon" })}
                        aria-label={t("actions.message", { name: client.name })}
                      >
                        <MessageCircle className="size-4" aria-hidden="true" />
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={t("actions.more", { name: client.name })}
                            />
                          }
                        >
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={<Link href={`/clients/${client.id}`} />}>
                            <User className="size-4" />
                            {t("actions.openProfile")}
                          </DropdownMenuItem>
                          {client.invited && (
                            <div className="px-1.5 py-1">
                              <RegenerateInviteButton locale={locale} clientId={client.id} />
                            </div>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {shown.length === 0 && (
          <EmptyState
            brandMark
            title={t("noResults")}
            description={t("noResultsHint")}
            className="border-t border-border"
          />
        )}
        <div className="border-t border-border px-4 py-3 text-muted-foreground">
          {t.rich("showing", {
            shown: formatNumber(shown.length, locale),
            total: formatNumber(clients.length, locale),
            num: mono,
          })}
        </div>
      </Card>
    </div>
  );
}
