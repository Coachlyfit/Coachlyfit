"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Link as LinkIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { presenceStatus, type PresenceStatus } from "@/domain/presence/presence-status";
import type { OnlineCoach } from "@/domain/presence/presence.service";
import type { AppLocale } from "@/domain/locale";
import { createInviteLinkAction, listCoachClientsAction } from "./actions";
import { DotAvatar, PresenceBadge, SeenText, STATUS_DOT, STATUS_TEXT, num } from "./online-bits";

const FILTERS = ["all", "online", "inactive", "never"] as const;
type Filter = (typeof FILTERS)[number];

export const clientsQueryKey = (coachId: string) => ["admin-online", "clients", coachId] as const;

/** The selected coach's clients. Mounted with key={coach.id}, so the filter
 * resets when the coach changes. Rows come from one query per coach; their
 * status is derived here from the live presence set, so a client coming
 * online flips the badge and the filter counts without a refetch. */
export function ClientsPanel({
  locale,
  coach,
  onlineIds,
}: {
  locale: AppLocale;
  coach: OnlineCoach;
  onlineIds: ReadonlySet<string>;
}) {
  const t = useTranslations("admin.online");
  const [filter, setFilter] = useState<Filter>("all");

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: clientsQueryKey(coach.id),
    queryFn: () => listCoachClientsAction(coach.id),
  });

  const rows = useMemo(
    () =>
      (data ?? []).map((c) => {
        const present = c.userId != null && onlineIds.has(c.userId);
        return { ...c, present, status: presenceStatus(present, c.lastSeenAt) };
      }),
    [data, onlineIds]
  );

  const counts: Record<Filter, number> = { all: rows.length, online: 0, inactive: 0, never: 0 };
  for (const r of rows) if (r.status !== "offline") counts[r.status]++;

  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const coachOnline = onlineIds.has(coach.id);

  return (
    <section
      aria-labelledby="online-clients-heading"
      className="min-w-0 flex-1 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <DotAvatar id={coach.id} name={coach.name} dot={coachOnline && STATUS_DOT.online} />
          <div className="flex min-w-0 flex-col leading-snug">
            <h2 id="online-clients-heading" className="truncate text-lg font-semibold">
              {coach.name}
            </h2>
            <span className="text-muted-foreground">
              <SeenText lastSeenAt={coach.lastSeenAt} present={coachOnline} locale={locale} />
              {" · "}
              {t.rich("panel.clients", { count: coach.clientTotal, value: formatNumber(coach.clientTotal, locale), num })}
            </span>
          </div>
        </div>

        <div role="group" aria-label={t("filters.label")} className="flex max-w-full gap-1 overflow-x-auto rounded-[10px] bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "h-8.5 shrink-0 rounded-lg px-3 font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === f && "bg-card shadow-xs"
              )}
            >
              {t(`filters.${f}`)}{" "}
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatNumber(counts[f], locale)}</span>
            </button>
          ))}
        </div>
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2 p-4" aria-busy="true">
          {Array.from({ length: Math.min(Math.max(coach.clientTotal, 1), 6) }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={Users}
          title={t("panel.loadError")}
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t("panel.retry")}
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={Users} title={rows.length === 0 ? t("empty.noClients") : t("empty.filter")} />
      ) : (
        <>
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.client")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead>{t("table.lastSeen")}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t("table.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((c) => (
                  <TableRow key={c.clientId}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <DotAvatar id={c.clientId} name={c.name} size="default" />
                        <span className="font-medium">{c.name}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <PresenceBadge status={c.status} />
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-col leading-snug">
                        <span>
                          <SeenText lastSeenAt={c.lastSeenAt} present={c.present} locale={locale} />
                        </span>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {c.lastSeenAt ? formatDate(c.lastSeenAt, locale, { dateStyle: "short" }) : "—"}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex justify-end">
                        {c.canInvite && <InviteLinkButton locale={locale} clientId={c.clientId} />}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y divide-border lg:hidden">
            {shown.map((c) => (
              <li key={c.clientId} className="flex items-center gap-2.5 px-3.5 py-2.5">
                <DotAvatar id={c.clientId} name={c.name} dot={STATUS_DOT[c.status]} />
                <span className="flex min-w-0 flex-1 flex-col leading-snug">
                  <span className="truncate font-medium">{c.name}</span>
                  <MobileStatusLine status={c.status} lastSeenAt={c.lastSeenAt} present={c.present} locale={locale} />
                </span>
                {c.canInvite && <InviteLinkButton locale={locale} clientId={c.clientId} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** On mobile the badge is dropped for space, so the line under the name
 * carries the status in words: the last-seen text already says "Online now"
 * / "Never logged in", and "inactive" is spelled out next to the day count. */
function MobileStatusLine({
  status,
  lastSeenAt,
  present,
  locale,
}: {
  status: PresenceStatus;
  lastSeenAt: string | null;
  present: boolean;
  locale: AppLocale;
}) {
  const t = useTranslations("admin.online.status");
  return (
    <span className={cn("text-[0.8125rem]", STATUS_TEXT[status])}>
      {status === "inactive" && `${t("inactive")} · `}
      <SeenText lastSeenAt={lastSeenAt} present={present} locale={locale} />
    </span>
  );
}

/** Mints a new single-use join link and shows it to copy -- nothing is sent
 * to the client. Same dialog as the coach's RegenerateInviteButton. */
function InviteLinkButton({ locale, clientId }: { locale: AppLocale; clientId: string }) {
  const t = useTranslations("admin.online.invite");
  const [pending, startTransition] = useTransition();
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function onClick() {
    startTransition(async () => {
      const result = await createInviteLinkAction(locale, clientId);
      if ("error" in result) {
        toast.error(t("error"));
        return;
      }
      setCopied(false);
      setJoinUrl(result.joinUrl);
    });
  }

  return (
    <>
      <Button variant="outline" size="xs" onClick={onClick} disabled={pending} className="shrink-0">
        <LinkIcon aria-hidden="true" />
        {pending ? t("pending") : t("action")}
      </Button>
      <Dialog open={!!joinUrl} onOpenChange={(next) => !next && setJoinUrl(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("body")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={joinUrl ?? ""} dir="ltr" className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => {
                if (joinUrl) void navigator.clipboard.writeText(joinUrl);
                setCopied(true);
              }}
              aria-label={t("copy")}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
