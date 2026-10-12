"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  Circle,
  CreditCard,
  KeyRound,
  Link2,
  type LucideIcon,
  Mail,
  Pause,
  Pencil,
  Play,
  Search,
  Shield,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import {
  AUDIT_ACTIONS,
  AUDIT_TIME_ZONE,
  type AuditAction,
  changes,
  groupByDay,
  isAuditAction,
  noteOf,
  show,
} from "@/domain/platform/audit";
import { AUDIT_PAGE_SIZE } from "./schemas";

export type AuditEntry = {
  id: string;
  created_at: string;
  admin_name: string | null;
  target_name: string | null;
  target_email: string | null;
  action: string;
  details: unknown;
};

const TONE = {
  info: "bg-info-tint text-info-tint-foreground",
  success: "bg-success-tint text-success-tint-foreground",
  warning: "bg-warning-tint text-warning-tint-foreground",
  destructive: "bg-destructive-tint text-destructive-tint-foreground",
  neutral: "bg-muted text-foreground",
} as const;

const ACTION_ICON: Record<AuditAction, [LucideIcon, keyof typeof TONE]> = {
  profile_update: [Pencil, "info"],
  email_change: [Mail, "info"],
  password_reset: [KeyRound, "warning"],
  role_change: [Shield, "info"],
  suspend: [Pause, "destructive"],
  unsuspend: [Play, "success"],
  delete: [Trash2, "destructive"],
  invite_link_created: [Link2, "success"],
  subscription_update: [CreditCard, "info"],
  note: [StickyNote, "warning"],
  request_approve: [Check, "success"],
  request_reject: [X, "destructive"],
};

const ALL = "all";
const strong = (chunks: React.ReactNode) => <b className="font-semibold text-foreground">{chunks}</b>;

export function AuditTab({
  locale,
  entries,
  total,
  page,
  action,
  admin,
  admins,
}: {
  locale: AppLocale;
  entries: AuditEntry[];
  total: number;
  page: number;
  action: AuditAction | null;
  admin: string | null;
  admins: { id: string; name: string }[];
}) {
  const t = useTranslations("admin.settings.audit");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const filtered = !!action || !!admin;

  // Filters and page live in the URL; the server page runs the query.
  function go(next: { action?: string; admin?: string; page?: number }) {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(next)) {
      if (value == null || value === ALL || value === 1) params.delete(key);
      else params.set(key, String(value));
    }
    // A new filter starts back on the first page.
    if (next.page == null) params.delete("page");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  const actionItems = [
    { value: ALL, label: t("allActions") },
    ...AUDIT_ACTIONS.map((value) => ({ value, label: t(`actions.${value}`) })),
  ];
  const adminItems = [{ value: ALL, label: t("allAdmins") }, ...admins.map((a) => ({ value: a.id, label: a.name }))];

  return (
    <section aria-label={t("title")} className="flex max-w-[980px] flex-col gap-3.5">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["action", action ?? ALL, actionItems, t("action")],
            ["admin", admin ?? ALL, adminItems, t("admin")],
          ] as const
        ).map(([key, value, items, label]) => (
          <Select key={key} value={value} onValueChange={(v) => go({ [key]: v as string })} items={items}>
            <SelectTrigger aria-label={label} className="bg-card data-[size=default]:h-11 md:data-[size=default]:h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl bg-card ring-1 ring-foreground/10">
          {filtered ? (
            <EmptyState
              icon={Search}
              title={t("noResults")}
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => go({ action: ALL, admin: ALL })}>
                  {t("clearFilters")}
                </Button>
              }
            />
          ) : (
            <EmptyState brandMark title={t("empty")} />
          )}
        </div>
      ) : (
        <div aria-busy={pending} className={cn("flex flex-col gap-3.5 transition-opacity", pending && "opacity-50")}>
          {groupByDay(entries).map((group) => (
            <div key={group.day} className="flex flex-col gap-2">
              <h3 className="font-semibold text-muted-foreground">
                {group.kind !== "date" && `${t(group.kind)} · `}
                <span className="font-mono tabular-nums">
                  {formatDate(`${group.day}T12:00:00Z`, locale, { timeZone: "UTC" })}
                </span>
              </h3>
              <div className="divide-y divide-border/60 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                {group.items.map((entry) => {
                  const known = isAuditAction(entry.action);
                  const [Icon, tone] = known ? ACTION_ICON[entry.action as AuditAction] : ([Circle, "neutral"] as const);
                  const note = noteOf(entry.details);
                  const diff = changes(entry.details);
                  const names = { admin: entry.admin_name ?? "—", target: entry.target_name ?? entry.target_email ?? "—" };
                  return (
                    <article key={entry.id} className="flex items-start gap-3 px-3.5 py-3.5 md:gap-3.5 md:px-4.5">
                      <time dateTime={entry.created_at} className="pt-1 font-mono text-muted-foreground tabular-nums md:min-w-14">
                        {formatDate(entry.created_at, locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                          timeZone: AUDIT_TIME_ZONE,
                        })}
                      </time>
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-[9px]", TONE[tone])}>
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <p className="text-muted-foreground">
                          {known
                            ? t.rich(`sentence.${entry.action as AuditAction}`, { ...names, b: strong })
                            : t.rich("sentence.other", { ...names, action: entry.action, b: strong })}
                        </p>
                        {diff.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {diff.map(([field, change]) => (
                              <span
                                key={field}
                                className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-background px-2 py-0.5 text-[0.8125rem] ring-1 ring-border"
                              >
                                <span className="text-muted-foreground">
                                  {t.has(`fields.${field}`) ? t(`fields.${field}`) : field}:
                                </span>
                                <span dir="ltr" className="inline-flex min-w-0 items-center gap-1.5 font-mono">
                                  <s className="truncate text-muted-foreground/70">{show(change.from)}</s>
                                  <span className="text-muted-foreground" aria-hidden="true">
                                    →
                                  </span>
                                  <b className="truncate font-semibold">{show(change.to)}</b>
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                        {note && (
                          <p className="rounded-lg bg-warning-tint px-2.5 py-1.5 text-[0.8125rem] whitespace-pre-wrap text-warning-tint-foreground">
                            {note}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} pageSize={AUDIT_PAGE_SIZE} total={total} onPageChange={(p) => go({ page: p })} disabled={pending} />
    </section>
  );
}
