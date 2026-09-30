"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateUserProfileAction } from "./actions";
import { deleteUserAction, sendPasswordResetAction, updateUserEmailAction } from "../actions";

export type ManagedUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: "admin" | "coach" | "client";
};

export function EditUserDialog({ locale, user }: { locale: string; user: ManagedUser }) {
  const t = useTranslations("admin.settings.users");
  const tErrors = useTranslations("admin.settings.errors");
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    if (next) {
      setFullName(user.full_name ?? "");
      setPhone(user.phone ?? "");
      setEmail(user.email ?? "");
    }
    setOpen(next);
  }

  function onSave() {
    startTransition(async () => {
      const profile = await updateUserProfileAction(locale, user.id, { fullName, phone });
      if (profile?.error) return void toast.error(tErrors(profile.error));

      if (email.trim().toLowerCase() !== (user.email ?? "").toLowerCase()) {
        const result = await updateUserEmailAction(locale, user.id, email);
        if (result?.error) return void toast.error(tErrors(result.error));
      }
      toast.success(t("saved"));
      setOpen(false);
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
    <>
      <Button variant="ghost" size="icon-sm" aria-label={t("edit")} onClick={() => onOpenChange(true)}>
        <Pencil />
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`fn-${user.id}`}>{t("name")}</Label>
              <Input id={`fn-${user.id}`} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`em-${user.id}`}>{t("email")}</Label>
              <Input id={`em-${user.id}`} type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`ph-${user.id}`}>{t("phone")}</Label>
              <Input id={`ph-${user.id}`} type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
            </div>
            <Button variant="outline" onClick={onResetPassword} disabled={pending || !user.email}>
              {t("resetPassword")}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button onClick={onSave} disabled={pending || !email.trim()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteUserDialog({ locale, user }: { locale: string; user: ManagedUser }) {
  const t = useTranslations("admin.settings.users");
  const tErrors = useTranslations("admin.settings.errors");
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const expected = user.email ?? "";
  const canDelete = user.role !== "admin";

  function onDelete() {
    startTransition(async () => {
      const result = await deleteUserAction(locale, user.id, confirm);
      if (result?.error) return void toast.error(tErrors(result.error));
      toast.success(t("deleted"));
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("delete")}
        disabled={!canDelete}
        title={canDelete ? undefined : t("deleteAdminBlocked")}
        onClick={() => {
          setConfirm("");
          setOpen(true);
        }}
      >
        <Trash2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle", { name: user.full_name ?? expected })}</DialogTitle>
            <DialogDescription>{user.role === "coach" ? t("deleteWarningCoach") : t("deleteWarning")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`del-${user.id}`}>{t("deleteConfirmLabel", { email: expected })}</Label>
            <Input id={`del-${user.id}`} dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
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
    </>
  );
}
