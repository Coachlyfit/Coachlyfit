"use client";

import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { REQUEST_TYPES, type RequestType } from "@/domain/billing/coach-subscription.service";
import { formatDate, formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { requestSubscriptionChangeAction, setCancelAtPeriodEndAction, withdrawRequestAction } from "./actions";
import { subscriptionRequestSchema, type SubscriptionRequestInput } from "./schemas";

export type TierOption = { id: string; name: string; price: number; maxClients: number | null };

export type RequestRow = {
  id: string;
  type: string;
  tierName: string | null;
  note: string | null;
  status: string;
  adminResponse: string | null;
  createdAt: string;
};

// No cap is null; the seeded top tier may still carry this old sentinel
// (see 20260820000001).
const UNLIMITED_CLIENTS = 999_999;

const STATUS_VARIANT = { pending: "warning", approved: "success", rejected: "destructive" } as const;

/** Cancel at period end / resume. Self-service: it only flips a flag, the
 * daily lifecycle job does the actual cancellation at the deadline. */
export function CancelControl({
  locale,
  cancelAtPeriodEnd,
  periodEnd,
}: {
  locale: AppLocale;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
}) {
  const t = useTranslations("billing.cancel");
  const tErrors = useTranslations("billing.errors");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(cancel: boolean) {
    startTransition(async () => {
      const result = await setCancelAtPeriodEndAction(locale, cancel);
      if (result?.error) {
        toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("request_failed"));
        return;
      }
      setOpen(false);
      toast.success(t(cancel ? "done" : "resumed"));
    });
  }

  if (cancelAtPeriodEnd) {
    return (
      <Button type="button" size="sm" className="w-fit" disabled={pending} onClick={() => run(false)}>
        {t("resume")}
      </Button>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        {t("action")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("confirmTitle")}
        description={periodEnd ? t("confirmBody", { date: formatDate(periodEnd, locale) }) : t("confirmBodyNoDate")}
        confirmLabel={t("action")}
        onConfirm={() => run(true)}
        pending={pending}
      />
    </>
  );
}

/** Plan list + the coach's requests. A plan change is a request an admin
 * approves: billing is manual, so there is nothing to charge automatically. */
export function PlansAndRequests({
  locale,
  tiers,
  currentTierId,
  canceled,
  isOwner,
  requests,
}: {
  locale: AppLocale;
  tiers: TierOption[];
  currentTierId: string | null;
  canceled: boolean;
  isOwner: boolean;
  requests: RequestRow[];
}) {
  const t = useTranslations("billing");
  const tErrors = useTranslations("billing.errors");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<SubscriptionRequestInput>({
    resolver: zodResolver(subscriptionRequestSchema),
    defaultValues: { type: "change_plan" },
  });
  const type = useWatch({ control, name: "type" });

  const hasPending = requests.some((r) => r.status === "pending");
  const canRequest = isOwner && !hasPending;
  const currentPrice = tiers.find((tier) => tier.id === currentTierId)?.price ?? null;
  const otherTiers = tiers.filter((tier) => tier.id !== currentTierId);

  function openDialog(defaults: SubscriptionRequestInput) {
    reset(defaults);
    setOpen(true);
  }

  function fail(code: string) {
    toast.error(tErrors.has(code) ? tErrors(code) : tErrors("request_failed"));
  }

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await requestSubscriptionChangeAction(locale, data);
      if (result?.error) return fail(result.error);
      setOpen(false);
      toast.success(t("requests.sent"));
    });
  });

  function withdraw(id: string) {
    startTransition(async () => {
      const result = await withdrawRequestAction(locale, id);
      if (result?.error) return fail(result.error);
      toast.success(t("requests.withdrawn"));
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("plans.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier) => {
            const current = tier.id === currentTierId;
            return (
              <div key={tier.id} className="flex flex-col gap-2 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{tier.name}</span>
                  {current && <Badge variant="secondary">{t("plans.current")}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{t("priceMonthly", { price: tier.price })}</p>
                <p className="text-sm text-muted-foreground">
                  {tier.maxClients == null || tier.maxClients >= UNLIMITED_CLIENTS
                    ? t("plans.unlimited")
                    : t("plans.clients", { max: formatNumber(tier.maxClients, locale) })}
                </p>
                {!current && isOwner && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-auto w-fit"
                    disabled={!canRequest}
                    onClick={() => openDialog({ type: "change_plan", tierId: tier.id })}
                  >
                    {currentPrice == null
                      ? t("plans.choose")
                      : t(tier.price > currentPrice ? "plans.upgrade" : "plans.downgrade")}
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t("requests.title")}</CardTitle>
          {isOwner && (
            <Button
              type="button"
              size="sm"
              disabled={!canRequest}
              onClick={() => openDialog({ type: canceled ? "reactivate" : "other" })}
            >
              {t("requests.new")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!isOwner && <p className="text-sm text-muted-foreground">{t("ownerOnly")}</p>}
          {isOwner && hasPending && <p className="text-sm text-muted-foreground">{t("requests.pendingHint")}</p>}
          {requests.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("requests.empty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {requests.map((request) => (
                <li key={request.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {t.has(`requests.types.${request.type}`) ? t(`requests.types.${request.type}`) : request.type}
                      {request.tierName && ` · ${request.tierName}`}
                    </span>
                    <Badge variant={STATUS_VARIANT[request.status as keyof typeof STATUS_VARIANT] ?? "secondary"}>
                      {t.has(`requests.status.${request.status}`) ? t(`requests.status.${request.status}`) : request.status}
                    </Badge>
                    <span className="ms-auto text-xs tabular-nums text-muted-foreground">
                      {formatDate(request.createdAt, locale)}
                    </span>
                  </div>
                  {request.note && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{request.note}</p>}
                  {request.adminResponse && (
                    <p className="text-sm whitespace-pre-wrap">
                      <span className="font-medium">{t("requests.response")}: </span>
                      {request.adminResponse}
                    </p>
                  )}
                  {isOwner && request.status === "pending" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-fit"
                      disabled={pending}
                      onClick={() => withdraw(request.id)}
                    >
                      {t("requests.withdraw")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("requests.dialogTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="request-type">{t("requests.type")}</Label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value as RequestType)}
                    items={REQUEST_TYPES.map((value) => ({ value, label: t(`requests.types.${value}`) }))}
                  >
                    <SelectTrigger id="request-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REQUEST_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`requests.types.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            {type === "change_plan" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="request-tier">{t("requests.plan")}</Label>
                <Controller
                  name="tierId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? null}
                      onValueChange={(value) => field.onChange(value ?? undefined)}
                      items={otherTiers.map((tier) => ({ value: tier.id, label: tier.name }))}
                    >
                      <SelectTrigger id="request-tier" className="w-full" aria-invalid={!!errors.tierId}>
                        <SelectValue placeholder={t("requests.planPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {otherTiers.map((tier) => (
                          <SelectItem key={tier.id} value={tier.id}>
                            {tier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.tierId && <p className="text-sm text-destructive">{t("requests.planRequired")}</p>}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="request-note">{t("requests.note")}</Label>
              <Textarea
                id="request-note"
                rows={3}
                maxLength={1000}
                placeholder={t("requests.notePlaceholder")}
                aria-invalid={!!errors.note}
                {...register("note")}
              />
              {errors.note && <p className="text-sm text-destructive">{t("requests.noteRequired")}</p>}
            </div>
            <Button type="submit" disabled={pending} className="min-w-24">
              {pending ? t("requests.sending") : t("requests.submit")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
