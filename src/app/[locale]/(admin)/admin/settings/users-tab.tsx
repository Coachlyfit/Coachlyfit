"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MoreHorizontal, Pause, Pencil, Play, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { ClientAvatar } from "@/app/[locale]/(coach)/dashboard/client-avatar";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import { setUserSuspendedAction } from "./actions";
import { DeleteUserDialog, EditUserDialog } from "./user-dialogs";

type AdminUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: "admin" | "coach" | "client";
  suspended_at: string | null;
  created_at: string;
};

const ROLE_FILTERS = ["all", "admin", "coach", "client"] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number];
const FILTER_LABEL = { all: "all", admin: "admins", coach: "coaches", client: "clients" } as const;

const ROLE_LABEL = { admin: "roleAdmin", coach: "roleCoach", client: "roleClient" } as const;
const ROLE_TINT = {
  admin: "bg-foreground text-background",
  coach: "bg-accent-tint text-accent-tint-foreground",
  client: "bg-muted text-foreground",
} as const;

type RowAction = "edit" | "suspend" | "unsuspend" | "delete";

function RoleBadge({ role }: { role: AdminUser["role"] }) {
  const t = useTranslations("admin.settings.users");
  return <Badge className={cn("rounded-md font-semibold", ROLE_TINT[role])}>{t(ROLE_LABEL[role])}</Badge>;
}

function StatusPill({ suspended }: { suspended: boolean }) {
  const t = useTranslations("admin.settings.users");
  return (
    <StatusBadge tone={suspended ? "destructive" : "success"}>
      <span className={cn("size-1.5 rounded-full", suspended ? "bg-destructive" : "bg-success")} aria-hidden="true" />
      {suspended ? t("suspended") : t("active")}
    </StatusBadge>
  );
}

function Identity({ user }: { user: AdminUser }) {
  const name = user.full_name ?? "—";
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <ClientAvatar id={user.id} name={user.full_name ?? user.email ?? "?"} size="default" />
      <span className="flex min-w-0 flex-col items-start leading-snug">
        {user.role === "coach" ? (
          <Link href={`/admin/coaches/${user.id}`} className="max-w-full truncate font-semibold underline-offset-2 hover:underline">
            {name}
          </Link>
        ) : (
          <span className="max-w-full truncate font-semibold">{name}</span>
        )}
        <span dir="ltr" title={user.email ?? undefined} className="max-w-full truncate text-[0.8125rem] text-muted-foreground">
          {user.email ?? "—"}
        </span>
      </span>
    </span>
  );
}

/** The ⋯ menu. Desktop keeps edit/suspend as visible buttons and only puts
 * delete here; mobile (`all`) has no room, so everything lives in the menu. */
function RowMenu({
  user,
  isSelf,
  all,
  onAction,
}: {
  user: AdminUser;
  isSelf: boolean;
  all?: boolean;
  onAction: (action: RowAction) => void;
}) {
  const t = useTranslations("admin.settings.users");
  // Own account: nothing destructive to offer (the RPCs refuse it as well).
  if (isSelf && !all) return <span className="size-10" aria-hidden="true" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("more")} className={cn(all && "size-11")} />}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        {all && (
          <DropdownMenuItem onClick={() => onAction("edit")}>
            <Pencil className="size-4" />
            {t("editShort")}
          </DropdownMenuItem>
        )}
        {all && !isSelf && (
          <DropdownMenuItem onClick={() => onAction(user.suspended_at ? "unsuspend" : "suspend")}>
            {user.suspended_at ? <Play className="size-4" /> : <Pause className="size-4" />}
            {user.suspended_at ? t("unsuspend") : t("suspend")}
          </DropdownMenuItem>
        )}
        {!isSelf && (
          <DropdownMenuItem
            variant="destructive"
            disabled={user.role === "admin"}
            title={user.role === "admin" ? t("deleteAdminBlocked") : undefined}
            onClick={() => onAction("delete")}
          >
            <Trash2 className="size-4" />
            {t("delete")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UsersTab({ locale, users, currentUserId }: { locale: AppLocale; users: AdminUser[]; currentUserId: string }) {
  const t = useTranslations("admin.settings.users");
  const tErrors = useTranslations("admin.settings.errors");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [dialog, setDialog] = useState<{ kind: "edit" | "suspend" | "delete"; user: AdminUser } | null>(null);
  const [pending, startTransition] = useTransition();

  const counts = useMemo(
    () =>
      Object.fromEntries(
        ROLE_FILTERS.map((f) => [f, f === "all" ? users.length : users.filter((u) => u.role === f).length])
      ) as Record<RoleFilter, number>,
    [users]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => role === "all" || u.role === role)
      .filter((u) => !q || [u.full_name, u.email, u.phone].some((v) => v?.toLowerCase().includes(q)));
  }, [users, role, query]);

  function setSuspended(user: AdminUser, suspended: boolean) {
    startTransition(async () => {
      const result = await setUserSuspendedAction(locale, user.id, suspended);
      if (result?.error) toast.error(tErrors(result.error));
      else setDialog(null);
    });
  }

  function onAction(user: AdminUser, action: RowAction) {
    if (action === "unsuspend") setSuspended(user, false);
    else setDialog({ kind: action, user });
  }

  return (
    <section aria-label={t("title")} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
        <div role="group" aria-label={t("role")} className="flex gap-1.5 overflow-x-auto md:flex-wrap">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={role === f}
              onClick={() => setRole(f)}
              className="flex h-8.5 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {t(FILTER_LABEL[f])}
              <span className="font-mono text-xs tabular-nums">{formatNumber(counts[f], locale)}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-[1_1_240px] md:max-w-80">
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
      </div>

      {users.length === 0 ? (
        <EmptyState brandMark title={t("empty")} />
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
                setRole("all");
                setQuery("");
              }}
            >
              {t("showAll")}
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-background text-muted-foreground hover:bg-background">
                  <TableHead>{t("user")}</TableHead>
                  <TableHead>{t("phone")}</TableHead>
                  <TableHead>{t("role")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => {
                  const isSelf = user.id === currentUserId;
                  const suspended = !!user.suspended_at;
                  return (
                    <TableRow key={user.id} className={cn(suspended && "bg-destructive-tint/30 hover:bg-destructive-tint/40")}>
                      <TableCell className="max-w-90">
                        <Identity user={user} />
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground tabular-nums">
                        <span dir="ltr">{user.phone ?? "—"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <RoleBadge role={user.role} />
                          {isSelf && (
                            <Badge variant="outline" className="rounded-md">
                              {t("you")}
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusPill suspended={suspended} />
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center justify-end gap-1.5">
                          <Button type="button" variant="outline" size="xs" onClick={() => onAction(user, "edit")}>
                            {t("editShort")}
                          </Button>
                          {!isSelf && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="xs"
                              disabled={pending}
                              onClick={() => onAction(user, suspended ? "unsuspend" : "suspend")}
                              className={cn(
                                "whitespace-nowrap",
                                suspended
                                  ? "bg-success-tint text-success-tint-foreground hover:bg-success-tint/70"
                                  : "bg-destructive-tint text-destructive-tint-foreground hover:bg-destructive-tint/70"
                              )}
                            >
                              {suspended ? t("unsuspend") : t("suspend")}
                            </Button>
                          )}
                          <RowMenu user={user} isSelf={isSelf} onAction={(action) => onAction(user, action)} />
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y divide-border md:hidden">
            {filtered.map((user) => {
              const isSelf = user.id === currentUserId;
              return (
                <li
                  key={user.id}
                  className={cn("flex items-center gap-2.5 py-2.5 ps-3.5 pe-1.5", user.suspended_at && "bg-destructive-tint/30")}
                >
                  <span className="min-w-0 flex-1">
                    <Identity user={user} />
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <RoleBadge role={user.role} />
                    {user.suspended_at && <StatusPill suspended />}
                  </span>
                  <RowMenu user={user} isSelf={isSelf} all onAction={(action) => onAction(user, action)} />
                </li>
              );
            })}
          </ul>
        </>
      )}

      {dialog?.kind === "edit" && (
        <EditUserDialog
          key={dialog.user.id}
          locale={locale}
          user={dialog.user}
          isSelf={dialog.user.id === currentUserId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "delete" && (
        <DeleteUserDialog key={dialog.user.id} locale={locale} user={dialog.user} onClose={() => setDialog(null)} />
      )}
      <ConfirmDialog
        open={dialog?.kind === "suspend"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("suspendTitle", { name: dialog?.user.full_name ?? dialog?.user.email ?? "" })}
        description={t("suspendBody")}
        confirmLabel={t("suspend")}
        pending={pending}
        onConfirm={() => dialog && setSuspended(dialog.user, true)}
      />
    </section>
  );
}
