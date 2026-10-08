"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Send, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Link } from "@/i18n/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import { tintFor } from "@/lib/tint";
import { cn } from "@/lib/utils";
import type { SubscriptionRosterStatus } from "@/domain/billing/client-subscription";
import type { AppLocale } from "@/domain/locale";
import { assignTemplateAction } from "../../forms/actions";

export type ConversationClient = {
  id: string;
  name: string;
  status: "invited" | "active" | "archived";
  program: string | null;
  lastCheckin: string | null;
  adherence: number | null;
  subscription: SubscriptionRosterStatus;
};

// canceled / none have no tone: nothing to act on, so they stay neutral
// (same mapping as the clients roster).
const SUBSCRIPTION_TONE: Partial<Record<SubscriptionRosterStatus, StatusTone>> = {
  active: "success",
  renewsSoon: "warning",
  expired: "destructive",
  frozen: "accent",
};

/** Who the coach is talking to, at a glance. Every value comes from the
 * roster view; a missing one shows a dash rather than a guess. */
export function ClientContextPanel({
  locale,
  client,
  checkinTemplateVersionId,
}: {
  locale: AppLocale;
  client: ConversationClient;
  /** null when the coach has no published default check-in form. */
  checkinTemplateVersionId: string | null;
}) {
  const t = useTranslations("inbox.context");
  const tClients = useTranslations("clients");
  const tCheckin = useTranslations("dashboard.sendCheckin");
  const [pending, startTransition] = useTransition();
  const subscriptionTone = SUBSCRIPTION_TONE[client.subscription];

  function sendCheckin() {
    if (!checkinTemplateVersionId) return;
    const formData = new FormData();
    formData.set("clientId", client.id);
    startTransition(async () => {
      try {
        const result = await assignTemplateAction(locale, checkinTemplateVersionId, formData);
        if (result?.error) {
          toast.error(tCheckin("failed"));
          return;
        }
      } catch {
        toast.error(tCheckin("failed"));
        return;
      }
      toast.success(tCheckin("sent"));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span
          className={cn(
            "flex size-16 items-center justify-center rounded-full text-2xl font-semibold text-white",
            tintFor(client.id),
          )}
          aria-hidden="true"
        >
          {client.name[0]}
        </span>
        <span className="font-semibold">{client.name}</span>
        <Badge variant={client.status === "active" ? "success" : "secondary"}>
          {tClients(`status.${client.status}`)}
        </Badge>
      </div>

      <dl className="flex flex-col gap-2.5 text-sm">
        <Row label={t("program")}>
          {client.program ? <span className="font-medium">{client.program}</span> : <Missing />}
        </Row>
        <Row label={t("lastCheckin")}>
          {client.lastCheckin ? (
            <span className="font-mono tabular-nums">
              {formatDate(client.lastCheckin, locale, { day: "2-digit", month: "2-digit", year: "numeric" })}
            </span>
          ) : (
            <Missing />
          )}
        </Row>
        <Row label={t("adherence")}>
          {client.adherence == null ? (
            <Missing />
          ) : (
            <span className="font-mono tabular-nums">{formatNumber(client.adherence, locale)}%</span>
          )}
        </Row>
        <Row label={t("subscription")}>
          {subscriptionTone ? (
            <StatusBadge tone={subscriptionTone}>{tClients(`subscription.${client.subscription}`)}</StatusBadge>
          ) : (
            <span className="text-muted-foreground">{tClients(`subscription.${client.subscription}`)}</span>
          )}
        </Row>
      </dl>

      <div className="flex flex-col gap-1.5 border-t border-border pt-3.5">
        <Link href={`/clients/${client.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          <User className="size-4" aria-hidden="true" />
          {t("openProfile")}
        </Link>
        {checkinTemplateVersionId ? (
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={sendCheckin}>
            <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            {t("sendCheckin")}
          </Button>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            {tCheckin("noTemplate")}{" "}
            <Link href="/settings" className="font-medium text-foreground underline underline-offset-2">
              {tCheckin("goToSettings")}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-end">{children}</dd>
    </div>
  );
}

function Missing() {
  return (
    <span className="text-muted-foreground" aria-hidden="true">
      —
    </span>
  );
}
