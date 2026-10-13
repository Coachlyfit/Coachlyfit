"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MoreHorizontal, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "@/domain/leads/leads.service";
import { deleteLeadAction, setLeadStatusAction } from "./actions";
import { ImportDialog } from "./import-dialog";
import { LeadDialog } from "./lead-dialog";

const STATUS_FILTERS = ["all", ...LEAD_STATUSES] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_TONE: Record<LeadStatus, StatusTone> = {
  new: "accent",
  contacted: "warning",
  replied: "success",
  signed_up: "success",
  unsubscribed: "destructive",
};

type DialogState = { kind: "add" } | { kind: "import" } | { kind: "edit" | "delete"; lead: Lead } | null;

export function LeadsClient({ locale, leads }: { locale: AppLocale; leads: Lead[] }) {
  const t = useTranslations("admin.leads");
  const tErrors = useTranslations("admin.leads.errors");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, startTransition] = useTransition();

  const statusItems = LEAD_STATUSES.map((value) => ({ value, label: t(`status.${value}`) }));

  const counts = useMemo(
    () =>
      Object.fromEntries(
        STATUS_FILTERS.map((f) => [f, f === "all" ? leads.length : leads.filter((lead) => lead.status === f).length])
      ) as Record<StatusFilter, number>,
    [leads]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads
      .filter((lead) => status === "all" || lead.status === status)
      .filter((lead) => !q || [lead.full_name, lead.email].some((value) => value?.toLowerCase().includes(q)));
  }, [leads, status, query]);

  function showError(code: string) {
    toast.error(tErrors.has(code) ? tErrors(code) : tErrors("save_failed"));
  }

  function changeStatus(lead: Lead, next: LeadStatus) {
    startTransition(async () => {
      const result = await setLeadStatusAction(locale, lead.id, next);
      if (result?.error) showError(result.error);
    });
  }

  function remove(lead: Lead) {
    startTransition(async () => {
      const result = await deleteLeadAction(locale, lead.id);
      if (result?.error) return showError(result.error);
      toast.success(t("deleted"));
      setDialog(null);
    });
  }

  return (
    <section aria-label={t("title")} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
        <div role="group" aria-label={t("table.status")} className="flex gap-1.5 overflow-x-auto md:flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={status === f}
              onClick={() => setStatus(f)}
              className="flex h-8.5 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {f === "all" ? t("filterAll") : t(`status.${f}`)}
              <span className="font-mono text-xs tabular-nums">{formatNumber(counts[f], locale)}</span>
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-[1_1_320px] flex-wrap items-center justify-end gap-2">
          <div className="relative min-w-0 flex-[1_1_200px] md:max-w-72">
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
          <Button type="button" variant="outline" onClick={() => setDialog({ kind: "import" })}>
            <Upload className="size-4" aria-hidden="true" />
            {t("import")}
          </Button>
          <Button type="button" onClick={() => setDialog({ kind: "add" })}>
            <Plus className="size-4" aria-hidden="true" />
            {t("add")}
          </Button>
        </div>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          brandMark
          title={t("empty")}
          description={t("emptyDescription")}
          action={
            <Button type="button" size="sm" onClick={() => setDialog({ kind: "add" })}>
              {t("add")}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("noResults")}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setStatus("all");
                setQuery("");
              }}
            >
              {t("showAll")}
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-background text-muted-foreground hover:bg-background">
              <TableHead>{t("table.name")}</TableHead>
              <TableHead>{t("table.email")}</TableHead>
              <TableHead>{t("table.source")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.lastContacted")}</TableHead>
              <TableHead>{t("table.createdAt")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("table.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((lead) => {
              const unsubscribed = !!lead.unsubscribed_at;
              const leadStatus = lead.status as LeadStatus;
              return (
                <TableRow key={lead.id} className={cn(unsubscribed && "bg-destructive-tint/30 hover:bg-destructive-tint/40")}>
                  <TableCell className="max-w-56 truncate font-semibold">{lead.full_name ?? "—"}</TableCell>
                  <TableCell dir="ltr" title={lead.email} className="max-w-64 truncate text-start text-muted-foreground">
                    {lead.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lead.source ?? "—"}</TableCell>
                  <TableCell>
                    {unsubscribed ? (
                      // Final: the database keeps an unsubscribed lead unsubscribed.
                      <StatusBadge tone="destructive">{t("status.unsubscribed")}</StatusBadge>
                    ) : (
                      <Select
                        value={leadStatus}
                        onValueChange={(value) => value && value !== leadStatus && changeStatus(lead, value as LeadStatus)}
                        items={statusItems}
                        disabled={pending}
                      >
                        <SelectTrigger size="sm" aria-label={t("table.status")} className="border-transparent ps-0">
                          <StatusBadge tone={STATUS_TONE[leadStatus]}>
                            <SelectValue />
                          </StatusBadge>
                        </SelectTrigger>
                        <SelectContent>
                          {statusItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.last_contacted_at ? formatDate(lead.last_contacted_at, locale) : t("never")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(lead.created_at, locale)}</TableCell>
                  <TableCell>
                    <span className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("more")} />}>
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-auto min-w-44">
                          <DropdownMenuItem onClick={() => setDialog({ kind: "edit", lead })}>
                            <Pencil className="size-4" />
                            {t("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => setDialog({ kind: "delete", lead })}>
                            <Trash2 className="size-4" />
                            {t("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {dialog?.kind === "add" && <LeadDialog locale={locale} onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && (
        <LeadDialog key={dialog.lead.id} locale={locale} lead={dialog.lead} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "import" && <ImportDialog locale={locale} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("deleteTitle", { name: dialog?.kind === "delete" ? (dialog.lead.full_name ?? dialog.lead.email) : "" })}
        description={t("deleteBody")}
        confirmLabel={t("delete")}
        pending={pending}
        onConfirm={() => dialog?.kind === "delete" && remove(dialog.lead)}
      />
    </section>
  );
}
