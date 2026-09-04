"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Snowflake, Play, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { subscriptionDisplayStatus, type SubscriptionDisplayStatus } from "@/domain/billing/client-subscription";
import { formatDate, formatNumber } from "@/lib/format";
import {
  freezeSubscriptionAction,
  unfreezeSubscriptionAction,
  cancelSubscriptionAction,
} from "@/app/[locale]/(coach)/clients/actions";
import { StartSubscriptionDialog } from "./start-subscription-dialog";

type Subscription = {
  id: string;
  status: "active" | "frozen" | "canceled";
  start_date: string;
  end_date: string;
  client_packages: { name_ar: string; name_en: string; price_egp: number };
};

const STATUS_VARIANT: Record<SubscriptionDisplayStatus, "default" | "secondary" | "destructive"> = {
  active: "default",
  expired: "destructive",
  frozen: "secondary",
  canceled: "secondary",
};

export function SubscriptionCard({
  locale,
  clientId,
  subscription,
  packages,
}: {
  locale: string;
  clientId: string;
  subscription: Subscription | null;
  packages: { id: string; name_ar: string; name_en: string; duration_days: number; price_egp: number }[];
}) {
  const t = useTranslations("clients.billing.subscription");
  const tErrors = useTranslations("clients.billing.errors");
  const tCommon = useTranslations("common");
  const displayLocale = useLocale() as AppLocale;
  const [pending, startTransition] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  if (!subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("none")}</p>
          <StartSubscriptionDialog locale={locale} clientId={clientId} packages={packages} />
        </CardContent>
      </Card>
    );
  }

  const status = subscriptionDisplayStatus(subscription, new Date());

  function runAction(action: (locale: string, clientId: string, subscriptionId: string) => Promise<{ error: string } | void>) {
    startTransition(async () => {
      const result = await action(locale, clientId, subscription!.id);
      if (result?.error) toast.error(tErrors(result.error));
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <Badge variant={STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="font-medium">{pickLocale(subscription.client_packages, displayLocale)}</p>
          <p className="text-sm text-muted-foreground">
            {t("dateRange", {
              start: formatDate(subscription.start_date, displayLocale),
              end: formatDate(subscription.end_date, displayLocale),
            })}
            {" · "}
            {formatNumber(subscription.client_packages.price_egp, displayLocale)} {t("egp")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {subscription.status === "active" && (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => runAction(freezeSubscriptionAction)} className="min-w-24">
              <Snowflake className="size-4" />
              {pending ? tCommon("pending") : t("freeze")}
            </Button>
          )}
          {subscription.status === "frozen" && (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => runAction(unfreezeSubscriptionAction)} className="min-w-24">
              <Play className="size-4" />
              {pending ? tCommon("pending") : t("unfreeze")}
            </Button>
          )}
          {subscription.status !== "canceled" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={pending}
              onClick={() => setConfirmingCancel(true)}
            >
              <Ban className="size-4" />
              {t("cancel")}
            </Button>
          )}
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        title={t("confirmCancelTitle")}
        description={t("confirmCancelBody")}
        confirmLabel={t("confirmCancelAction")}
        onConfirm={() => {
          runAction(cancelSubscriptionAction);
          setConfirmingCancel(false);
        }}
        pending={pending}
      />
    </Card>
  );
}
