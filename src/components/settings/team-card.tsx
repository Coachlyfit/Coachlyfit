"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UpgradePrompt } from "@/components/dashboard/upgrade-prompt";
import { formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { TeamSeats } from "@/domain/team/team.service";
import { inviteTeamMemberAction, removeTeamMemberAction } from "@/app/[locale]/(coach)/settings/team-actions";

const inviteFormSchema = z.object({
  email: z.string().email(),
});
type InviteFormInput = z.input<typeof inviteFormSchema>;

type TeamMember = { id: string; email: string; accepted_at: string | null; expired: boolean };

/** `seats` and `isOwner` only shape what is offered: the seat cap and the
 * owner-only rule are enforced on team_members itself (20261020000001). */
const num = (chunks: React.ReactNode) => <span className="font-mono tabular-nums">{chunks}</span>;

export function TeamCard({
  members,
  seats,
  isOwner,
}: {
  members: TeamMember[];
  seats: TeamSeats | null;
  isOwner: boolean;
}) {
  const t = useTranslations("settings.team");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("settings.errors");
  const locale = useLocale() as AppLocale;
  const [open, setOpen] = useState(false);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteFormInput>({ resolver: zodResolver(inviteFormSchema) });

  const onSubmit = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("email", data.email);
    startTransition(async () => {
      const result = await inviteTeamMemberAction(locale, formData);
      if ("error" in result) {
        toast.error(tErrors(result.error));
        return;
      }
      setJoinUrl(`${window.location.origin}/${locale}/join-team/${result.token}`);
    });
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
      setJoinUrl(null);
      setCopied(false);
    }
  }

  const atLimit = seats !== null && seats.max !== null && seats.used >= seats.max;
  // More members than the plan allows: a downgrade. Nobody is removed.
  const overLimit = seats !== null && seats.max !== null && seats.accepted > seats.max;

  function confirmRemove() {
    if (!pendingRemove) return;
    startTransition(async () => {
      const result = await removeTeamMemberAction(locale, pendingRemove);
      if (result?.error) toast.error(tErrors(result.error));
      setPendingRemove(null);
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <span className="flex min-w-0 flex-col gap-0.5">
          <CardTitle className="text-base">{t("title")}</CardTitle>
          {seats && (
            <span className="text-xs text-muted-foreground">
              {seats.max === null
                ? t.rich("usageUnlimited", { used: formatNumber(seats.used, locale), num })
                : t.rich("usage", {
                    used: formatNumber(seats.used, locale),
                    max: formatNumber(seats.max, locale),
                    num,
                  })}
            </span>
          )}
        </span>
        {isOwner && (
          <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger render={<Button type="button" variant="outline" size="sm" disabled={atLimit} />}>
              <Plus className="size-4" />
              {t("add")}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{joinUrl ? t("linkTitle") : t("add")}</DialogTitle>
                {joinUrl && <DialogDescription>{t("linkBody")}</DialogDescription>}
              </DialogHeader>

              {joinUrl ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <Input readOnly value={joinUrl} className="font-mono text-xs" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => {
                        navigator.clipboard.writeText(joinUrl);
                        setCopied(true);
                      }}
                      aria-label={t("copy")}
                    >
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </Button>
                  </div>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    {t("done")}
                  </Button>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="team_email">{t("emailLabel")}</Label>
                    <Input id="team_email" type="email" dir="ltr" {...register("email")} />
                    {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                  </div>
                  <Button type="submit" disabled={pending} className="min-w-24">
                    {pending ? tCommon("pending") : t("submit")}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!isOwner && <p className="text-sm text-muted-foreground">{t("ownerOnly")}</p>}
        {overLimit && <p className="text-sm text-warning-tint-foreground">{t("overLimit")}</p>}
        {isOwner && atLimit && <UpgradePrompt feature="team_members" />}
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate">{member.email}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {member.accepted_at ? t("statusAccepted") : member.expired ? t("statusExpired") : t("statusPending")}
                  </span>
                </span>
                {isOwner && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    aria-label={t("delete")}
                    onClick={() => setPendingRemove(member.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={!!pendingRemove}
        onOpenChange={(o) => !o && setPendingRemove(null)}
        title={t("confirmDeleteTitle")}
        confirmLabel={t("delete")}
        onConfirm={confirmRemove}
        pending={pending}
      />
    </Card>
  );
}
