"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ban, CreditCard, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormDatePicker } from "@/components/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addCoachNoteAction, setCoachSuspendedAction, updateSubscriptionAction } from "../../actions";
import { SUBSCRIPTION_STATUSES, updateSubscriptionSchema, type UpdateSubscriptionInput } from "../../schemas";

type Status = (typeof SUBSCRIPTION_STATUSES)[number];

function useActionError() {
  const tErrors = useTranslations("admin.coaches.errors");
  return (code: string) => toast.error(tErrors.has(code) ? tErrors(code) : tErrors("update_failed"));
}

/** Plan, status, end date and the cancel flag in one form. Everything is
 * sent; admin_update_subscription() logs only what actually changed. */
export function ManageSubscriptionDialog({
  locale,
  coachId,
  tiers,
  current,
}: {
  locale: string;
  coachId: string;
  tiers: { id: string; name: string }[];
  /** null = the coach has no subscription row; saving creates one. */
  current: {
    tierId: string;
    status: string;
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    complimentary: boolean;
  } | null;
}) {
  const t = useTranslations("admin.coaches.detail.manage");
  const tStatus = useTranslations("admin.coaches.status");
  const tCommon = useTranslations("common");
  const fail = useActionError();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const defaults: UpdateSubscriptionInput = {
    coachId,
    tierId: current?.tierId ?? tiers[0]?.id ?? "",
    status: (current?.status as Status | undefined) ?? "active",
    periodEnd: current?.periodEnd?.slice(0, 10) ?? "",
    cancelAtPeriodEnd: current?.cancelAtPeriodEnd ?? false,
    complimentary: current?.complimentary ?? false,
  };

  const { handleSubmit, control, reset } = useForm<UpdateSubscriptionInput>({
    resolver: zodResolver(updateSubscriptionSchema),
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await updateSubscriptionAction(locale, data);
      if (result?.error) return void fail(result.error);
      setOpen(false);
      toast.success(t("saved"));
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset(defaults);
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <CreditCard className="size-4" aria-hidden="true" />
        {t("action")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="manage-tier">{t("plan")}</Label>
              <Controller
                name="tierId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    items={tiers.map((tier) => ({ value: tier.id, label: tier.name }))}
                  >
                    <SelectTrigger id="manage-tier" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tiers.map((tier) => (
                        <SelectItem key={tier.id} value={tier.id}>
                          {tier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="manage-status">{t("status")}</Label>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    items={SUBSCRIPTION_STATUSES.map((status) => ({ value: status, label: tStatus(status) }))}
                  >
                    <SelectTrigger id="manage-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBSCRIPTION_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {tStatus(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="manage-period-end">{t("periodEnd")}</Label>
            <FormDatePicker id="manage-period-end" control={control} name="periodEnd" />
            <p className="text-xs text-muted-foreground">{t("periodEndHint")}</p>
          </div>
          <Controller
            name="cancelAtPeriodEnd"
            control={control}
            render={({ field }) => (
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                {t("cancelAtPeriodEnd")}
              </Label>
            )}
          />
          <Controller
            name="complimentary"
            control={control}
            render={({ field }) => (
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                {t("complimentary")}
              </Label>
            )}
          />
          <Button type="submit" disabled={pending || tiers.length === 0} className="min-w-24">
            {pending ? tCommon("pending") : tCommon("save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SuspendButton({
  locale,
  coachId,
  suspended,
}: {
  locale: string;
  coachId: string;
  suspended: boolean;
}) {
  const t = useTranslations("admin.coaches.detail.suspend");
  const fail = useActionError();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const result = await setCoachSuspendedAction(locale, coachId, !suspended);
      if (result?.error) return void fail(result.error);
      setOpen(false);
      toast.success(t(suspended ? "unsuspended" : "suspended"));
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {suspended ? <RotateCcw className="size-4" aria-hidden="true" /> : <Ban className="size-4" aria-hidden="true" />}
        {t(suspended ? "unsuspend" : "action")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t(suspended ? "unsuspendTitle" : "confirmTitle")}
        description={t(suspended ? "unsuspendBody" : "confirmBody")}
        confirmLabel={t(suspended ? "unsuspend" : "action")}
        onConfirm={onConfirm}
        pending={pending}
        variant={suspended ? "default" : "destructive"}
      />
    </>
  );
}

/** Internal note: stored in the admin audit log, never shown to the coach. */
export function CoachNoteForm({ locale, coachId }: { locale: string; coachId: string }) {
  const t = useTranslations("admin.coaches.detail.activity");
  const tCommon = useTranslations("common");
  const fail = useActionError();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addCoachNoteAction(locale, { coachId, note });
      if (result?.error) return void fail(result.error);
      setNote("");
      toast.success(t("noteSaved"));
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <Label htmlFor="coach-note">{t("noteLabel")}</Label>
      <Textarea
        id="coach-note"
        rows={2}
        maxLength={1000}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("notePlaceholder")}
      />
      <Button type="submit" size="sm" className="w-fit min-w-24" disabled={pending || !note.trim()}>
        {pending ? tCommon("pending") : t("addNote")}
      </Button>
    </form>
  );
}
