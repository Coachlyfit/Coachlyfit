"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { setUserRoleAction, setUserSuspendedAction } from "./actions";
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

function UserRow({ locale, user, currentUserId }: { locale: string; user: AdminUser; currentUserId: string }) {
  const t = useTranslations("admin.settings.users");
  const tErrors = useTranslations("admin.settings.errors");
  const [role, setRole] = useState(user.role);
  const [suspended, setSuspended] = useState(!!user.suspended_at);
  const [pending, startTransition] = useTransition();
  const isSelf = user.id === currentUserId;

  function onRoleChange(next: AdminUser["role"] | null) {
    if (!next) return;
    const prev = role;
    setRole(next);
    startTransition(async () => {
      const result = await setUserRoleAction(locale, user.id, next);
      if (result?.error) {
        setRole(prev);
        toast.error(tErrors(result.error));
      }
    });
  }

  function onSuspendChange(next: boolean) {
    setSuspended(next);
    startTransition(async () => {
      const result = await setUserSuspendedAction(locale, user.id, next);
      if (result?.error) {
        setSuspended(!next);
        toast.error(tErrors(result.error));
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {user.role === "coach" ? (
          <Link href={`/admin/coaches/${user.id}`} className="underline underline-offset-2">
            {user.full_name ?? "—"}
          </Link>
        ) : (
          (user.full_name ?? "—")
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{user.email ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{user.phone ?? "—"}</TableCell>
      <TableCell>
        <Select value={role} onValueChange={onRoleChange} disabled={pending || isSelf}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
            <SelectItem value="coach">{t("roleCoach")}</SelectItem>
            <SelectItem value="client">{t("roleClient")}</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {isSelf ? (
          <Badge variant="secondary">{t("you")}</Badge>
        ) : (
          <Switch checked={suspended} disabled={pending} onCheckedChange={onSuspendChange} aria-label={t("suspended")} />
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <EditUserDialog locale={locale} user={user} />
          {!isSelf && <DeleteUserDialog locale={locale} user={user} />}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function UsersTab({ locale, users, currentUserId }: { locale: string; users: AdminUser[]; currentUserId: string }) {
  const t = useTranslations("admin.settings.users");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.full_name, u.email, u.phone].some((v) => v?.toLowerCase().includes(q))
    );
  }, [users, query]);

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder={t("searchPlaceholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("email")}</TableHead>
            <TableHead>{t("phone")}</TableHead>
            <TableHead>{t("role")}</TableHead>
            <TableHead>{t("suspended")}</TableHead>
            <TableHead>{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((user) => (
            <UserRow key={user.id} locale={locale} user={user} currentUserId={currentUserId} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
