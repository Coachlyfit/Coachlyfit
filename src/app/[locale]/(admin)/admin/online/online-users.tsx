"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, Radio } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { groupByCoach, type OnlineUserRow } from "@/domain/presence/presence.service";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";

const PAGE_SIZE = 20;
const UNASSIGNED_TAB = "unassigned";

export function OnlineUsers({ locale, rows }: { locale: AppLocale; rows: OnlineUserRow[] }) {
  const t = useTranslations("admin.online");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const allGroups = useMemo(() => groupByCoach(rows), [rows]);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!q) return allGroups;
    return allGroups
      .map((g) => ({
        ...g,
        clients: g.clients.filter((c) => c.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.clients.length > 0 || (g.coach?.name.toLowerCase().includes(q) ?? false));
  }, [allGroups, q]);

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const tabValue = activeTab && groups.some((g) => tabKey(g.coach) === activeTab)
    ? activeTab
    : tabKey(groups[0]?.coach ?? null);

  const activeGroup = groups.find((g) => tabKey(g.coach) === tabValue) ?? groups[0];
  const shownClients = activeGroup?.clients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? [];

  function selectTab(value: string) {
    setActiveTab(value);
    setPage(1);
  }

  if (rows.length === 0) {
    return <EmptyState icon={Radio} title={t("empty")} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <AutoRefresh />
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto size-4 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder={t("search")}
          className="h-9 ps-8"
        />
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={Radio} title={t("noResults")} />
      ) : (
        <Tabs value={tabValue} onValueChange={(v) => selectTab(v as string)}>
          <TabsList className="h-auto flex-wrap">
            {groups.map((g) => {
              const key = tabKey(g.coach);
              const label = g.coach ? g.coach.name : t("unassigned");
              return (
                <TabsTrigger key={key} value={key} className="gap-1.5">
                  {g.coach && (
                    <span className={`size-1.5 shrink-0 rounded-full ${g.coach.online ? "bg-success" : "bg-muted-foreground/40"}`} />
                  )}
                  {label}
                  <Badge variant="secondary" className="ms-1">
                    {g.onlineCount}/{g.clients.length}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {groups.map((g) => {
            const key = tabKey(g.coach);
            if (key !== tabValue) return null;
            return (
              <TabsContent key={key} value={key}>
                {g.clients.length === 0 ? (
                  <EmptyState icon={Radio} title={t("empty")} />
                ) : (
                  <Card className="overflow-hidden py-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("table.name")}</TableHead>
                          <TableHead>{t("table.status")}</TableHead>
                          <TableHead>{t("table.lastSeen")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shownClients.map((client) => (
                          <TableRow key={client.userId}>
                            <TableCell className="font-medium">{client.name}</TableCell>
                            <TableCell>
                              <Badge variant={client.online ? "success" : "outline"}>
                                {client.online ? t("online") : t("offline")}
                              </Badge>
                            </TableCell>
                            <TableCell className="tabular-nums text-muted-foreground">
                              {client.lastSeenAt ? formatRelativeTime(client.lastSeenAt, locale) : t("never")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
                <Pagination page={page} pageSize={PAGE_SIZE} total={g.clients.length} onPageChange={setPage} />
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}

function tabKey(coach: { id: string } | null): string {
  return coach?.id ?? UNASSIGNED_TAB;
}
