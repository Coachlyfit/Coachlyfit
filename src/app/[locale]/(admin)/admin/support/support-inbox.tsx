"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TicketStatusBadge, useTicketStatusLabel } from "@/components/support/ticket-status-badge";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { TICKET_CATEGORIES, TICKET_STATUSES } from "@/domain/support/support";
import { Link } from "@/i18n/navigation";

export type InboxRow = {
  id: string;
  subject: string;
  category: string;
  status: string;
  coachId: string;
  coachName: string;
  lastMessageAt: string;
  unread: boolean;
};

const STATUS_FILTERS = ["all", ...TICKET_STATUSES] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// The base-ui Select has no empty value.
const ALL = "all";

export function SupportInbox({ locale, tickets }: { locale: AppLocale; tickets: InboxRow[] }) {
  const t = useTranslations("admin.support");
  const tSupport = useTranslations("support");
  const statusLabel = useTicketStatusLabel("admin");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState(ALL);
  const [coach, setCoach] = useState(ALL);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        STATUS_FILTERS.map((f) => [f, f === "all" ? tickets.length : tickets.filter((row) => row.status === f).length]),
      ) as Record<StatusFilter, number>,
    [tickets],
  );

  const categoryItems = [
    { value: ALL, label: t("allCategories") },
    ...TICKET_CATEGORIES.map((value) => ({ value, label: tSupport(`category.${value}`) })),
  ];

  // Only coaches who have a ticket, by name.
  const coachItems = useMemo(() => {
    const byId = new Map(tickets.map((row) => [row.coachId, row.coachName]));
    const sorted = [...byId].sort((a, b) => a[1].localeCompare(b[1], locale));
    return [{ value: ALL, label: t("allCoaches") }, ...sorted.map(([value, label]) => ({ value, label }))];
  }, [tickets, locale, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets
      .filter((row) => status === "all" || row.status === status)
      .filter((row) => category === ALL || row.category === category)
      .filter((row) => coach === ALL || row.coachId === coach)
      .filter((row) => !q || [row.subject, row.coachName].some((value) => value.toLowerCase().includes(q)));
  }, [tickets, status, category, coach, query]);

  function clearFilters() {
    setStatus("all");
    setCategory(ALL);
    setCoach(ALL);
    setQuery("");
  }

  return (
    <section aria-label={t("title")} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5">
        <div role="group" aria-label={t("statusLabel")} className="flex gap-1.5 overflow-x-auto md:flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={status === f}
              onClick={() => setStatus(f)}
              className="flex h-8.5 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {f === "all" ? t("filterAll") : statusLabel(f)}
              <span className="font-mono text-xs tabular-nums">{formatNumber(counts[f], locale)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-[1_1_220px] md:max-w-80">
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
              className="h-11 ps-9 md:h-10"
            />
          </div>
          <Select value={category} onValueChange={(value) => setCategory(value ?? ALL)} items={categoryItems}>
            <SelectTrigger aria-label={t("filterCategory")} className="h-11 min-w-40 md:h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={coach} onValueChange={(value) => setCoach(value ?? ALL)} items={coachItems}>
            <SelectTrigger aria-label={t("filterCoach")} className="h-11 min-w-40 md:h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {coachItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {tickets.length === 0 ? (
        <EmptyState brandMark title={t("empty")} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("noResults")}
          action={
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              {t("showAll")}
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-background text-muted-foreground hover:bg-background">
              <TableHead>{tSupport("table.subject")}</TableHead>
              <TableHead>{t("coach")}</TableHead>
              <TableHead>{tSupport("table.category")}</TableHead>
              <TableHead>{tSupport("table.status")}</TableHead>
              <TableHead>{tSupport("table.updated")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-72">
                  <Link
                    href={`/admin/support/${row.id}`}
                    className="flex min-h-11 items-center gap-2 font-semibold underline-offset-4 hover:underline"
                  >
                    {row.unread && (
                      <span role="img" aria-label={tSupport("unread")} className="size-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <span className="truncate">{row.subject}</span>
                  </Link>
                </TableCell>
                <TableCell className="max-w-48 truncate text-muted-foreground">{row.coachName}</TableCell>
                <TableCell className="text-muted-foreground">
                  {tSupport.has(`category.${row.category}`) ? tSupport(`category.${row.category}`) : row.category}
                </TableCell>
                <TableCell>
                  <TicketStatusBadge status={row.status} viewer="admin" />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatRelativeTime(row.lastMessageAt, locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
