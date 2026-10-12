"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setUserRoleAction, updateUserProfileAction } from "./actions";
import { deleteUserAction, sendPasswordResetAction, updateUserEmailAction } from "../actions";

export type ManagedUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: "admin" | "coach" | "client";
};

const ROLES = ["admin", "coach", "client"] as const;
const ROLE_LABEL = { admin: "roleAdmin", coach: "roleCoach", client: "roleClient" } as const;
const FIELD = "h-11 md:h-10";

/** Controlled: the users tab mounts one per target (keyed by user id), so the
 * fields start from that user's current values. */
export function EditUserDialog({
  locale,
  user,
  isSelf,
  onClose,
}: {
  locale: string;
  user: ManagedUser;
  /** Admins can't change their own role (admin_set_role refuses it too). */
  isSelf: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("admin.settings.users");
  const tErrors = useTranslations("admin.settings.errors");
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [role, setRole] = useState(user.role);
  const [pending, startTransition] = useTransition();
  const roleItems = ROLES.map((value) => ({ value, label: t(ROLE_LABEL[value]) }));

  function onSave() {
    startTransition(async () => {
      const profile = await updateUserProfileAction(locale, user.id, { fullName, phone });
      if (profile?.error) return void toast.error(tErrors(profile.error));

      if (role !== user.role) {
        const result = await setUserRoleAction(locale, user.id, role);
        if (result?.error) return void toast.error(tErrors(result.error));
      }
      if (email.trim().toLowerCase() !== (user.email ?? "").toLowerCase()) {
        const result = await updateUserEmailAction(locale, user.id, email);
        if (result?.error) return void toast.error(tErrors(result.error));
      }
      toast.success(t("saved"));
      onClose();
    });
  }

  function onResetPassword() {
    startTransition(async () => {
      const result = await sendPasswordResetAction(locale, user.id);
      if (result?.error) return void toast.error(tErrors(result.error));
      toast.success(t("resetSent"));
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-user-name">{t("name")}</Label>
            <Input
              id="edit-user-name"
              className={FIELD}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-user-email">{t("email")}</Label>
            <Input
              id="edit-user-email"
              type="email"
              dir="ltr"
              className={FIELD}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-user-phone">{t("phone")}</Label>
            <Input
              id="edit-user-phone"
              type="tel"
              dir="ltr"
              className={FIELD}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={30}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-user-role">{t("role")}</Label>
            <Select
              value={role}
              onValueChange={(v) => v && setRole(v as ManagedUser["role"])}
              items={roleItems}
              disabled={pending || isSelf}
            >
              <SelectTrigger id="edit-user-role" className="w-full data-[size=default]:h-11 md:data-[size=default]:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSelf && <p className="text-[0.8125rem] text-muted-foreground">{t("ownRoleHint")}</p>}
          </div>
          <Button variant="outline" onClick={onResetPassword} disabled={pending || !user.email}>
            {t("resetPassword")}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button onClick={onSave} disabled={pending || !email.trim()}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteUserDialog({ locale, user, onClose }: { locale: string; user: ManagedUser; onClose: () => void }) {
  const t = useTranslations("admin.settings.users");
  const tErrors = useTranslations("admin.settings.errors");
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const expected = user.email ?? "";

  function onDelete() {
    startTransition(async () => {
      const result = await deleteUserAction(locale, user.id, confirm);
      if (result?.error) return void toast.error(tErrors(result.error));
      toast.success(t("deleted"));
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteTitle", { name: user.full_name ?? expected })}</DialogTitle>
          <DialogDescription>{user.role === "coach" ? t("deleteWarningCoach") : t("deleteWarning")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delete-user-confirm">{t("deleteConfirmLabel", { email: expected })}</Label>
          <Input
            id="delete-user-confirm"
            dir="ltr"
            className={FIELD}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onDelete}
            disabled={pending || !expected || confirm.trim().toLowerCase() !== expected.toLowerCase()}
          >
            {t("deleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
