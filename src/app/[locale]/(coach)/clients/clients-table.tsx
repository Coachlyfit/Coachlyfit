"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { Link } from "@/i18n/navigation";
import { tintFor } from "@/lib/tint";
import { RegenerateInviteButton } from "./regenerate-invite-button";

type ClientRow = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  status: "invited" | "active" | "archived";
  created_at: string;
  adherence: number | null;
  lastActive: string | null;
  isLate: boolean;
};

type Filter = "all" | "active" | "late";

export function ClientsTable({ locale, clients }: { locale: AppLocale; clients: ClientRow[] }) {
  const t = useTranslations("clients");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients
      .filter((c) => filter === "all" || (filter === "late" ? c.isLate : c.status === "active"))
      .filter((c) => !q || c.display_name.toLowerCase().includes(q));
  }, [clients, query, filter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-sm sm:flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="ps-9"
          />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          label={t("title")}
          options={[
            { value: "all", label: t("filters.all") },
            { value: "active", label: t("filters.active") },
            { value: "late", label: t("filters.late") },
          ]}
        />
        <span className="ms-auto font-mono text-xs text-muted-foreground">
          {t("countLabel", { shown: shown.length, total: clients.length })}
        </span>
      </div>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("table.contact")}</TableHead>
              <TableHead>{t("table.adherence")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("table.lastActivity")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("table.joined")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-medium">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${tintFor(client.id)}`}
                    >
                      {client.display_name[0]}
                    </div>
                    <Link href={`/clients/${client.id}`} className="min-w-0 truncate hover:underline">
                      {client.display_name}
                    </Link>
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{client.email || client.phone || "—"}</TableCell>
                <TableCell>
                  {client.adherence == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${client.isLate ? "bg-accent" : "bg-foreground"}`}
                          style={{ width: `${client.adherence}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {client.adherence}%
                      </span>
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {client.lastActive ? formatDate(client.lastActive, locale) : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={client.isLate ? "secondary" : client.status === "active" ? "default" : "secondary"}>
                    {client.isLate ? t("filters.late") : t(`status.${client.status}`)}
                  </Badge>
                </TableCell>
                <TableCell className="hidden tabular-nums lg:table-cell">{formatDate(client.created_at, locale)}</TableCell>
                <TableCell>
                  {client.status === "invited" && <RegenerateInviteButton locale={locale} clientId={client.id} />}
                </TableCell>
              </TableRow>
            ))}
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
      </Card>
    </div>
  );
}
