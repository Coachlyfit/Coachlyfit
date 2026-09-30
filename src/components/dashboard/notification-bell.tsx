"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { Notification } from "@/domain/notifications/notifications.service";
import { Link } from "@/i18n/navigation";
import { listNotificationsAction, markNotificationsReadAction } from "./notifications-actions";
import { usePushSubscription } from "./use-push-subscription";

// coach_decision is client-only (see the migration's notify_on_decision
// trigger — it only ever inserts to a client's profile_id), so it never
// reaches this coach/admin-side bell; only decision_outcome shows up here,
// for the coach's own copy of that notification.
// client_left goes to the old coach when a client accepts another coach's
// invite (respond_to_coach_invite); coach_invite is client-only, like
// coach_decision. off_plan_reported goes to the client's active coach
// (notify_on_off_plan); nutrition_log_reminder is client-only, push-only.
const KINDS = [
  "exercise_promoted",
  "food_promoted",
  "new_message",
  "decision_outcome",
  "client_left",
  "off_plan_reported",
] as const;

function isKnownKind(kind: string): kind is (typeof KINDS)[number] {
  return (KINDS as readonly string[]).includes(kind);
}

export function NotificationBell({ locale }: { locale: AppLocale }) {
  const t = useTranslations("notifications");
  const tOutcome = useTranslations("ledger.outcome");
  const tPush = useTranslations("common.push");
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const push = usePushSubscription();

  async function togglePush() {
    try {
      await push.toggle();
    } catch {
      toast.error(tPush("failed"));
    }
  }

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotificationsAction,
  });

  const unread = notifications.filter((n) => !n.read_at).length;

  function message(notification: Notification) {
    if (!isKnownKind(notification.kind)) return t("unknown");
    const payload = (notification.payload ?? {}) as Record<string, unknown>;
    if (notification.kind === "new_message") {
      return t("new_message", { name: (payload.sender_name as string | null) ?? t("unknown") });
    }
    if (notification.kind === "decision_outcome") {
      return t("decision_outcome", { status: tOutcome(payload.outcome_status as string) });
    }
    if (notification.kind === "client_left") {
      return t("client_left", { name: (payload.display_name as string | null) ?? t("unknown") });
    }
    if (notification.kind === "off_plan_reported") {
      return t("off_plan_reported", {
        name: (payload.client_name as string | null) ?? t("unknown"),
        date: (payload.log_date as string | null) ?? "",
      });
    }
    // payload is jsonb, so it arrives as an untyped object — pickLocale
    // reads the same name_ar/name_en pair the promote function wrote.
    return t(notification.kind, { name: pickLocale(payload, locale) });
  }

  function href(notification: Notification): string | null {
    const payload = (notification.payload ?? {}) as Record<string, unknown>;
    if (notification.kind === "new_message") {
      const clientId = payload.client_id as string | null;
      return clientId ? `/inbox/${clientId}` : null;
    }
    if (notification.kind === "decision_outcome") {
      const clientId = payload.client_id as string | null;
      return clientId ? `/clients/${clientId}?tab=decisions` : null;
    }
    if (notification.kind === "off_plan_reported") {
      const clientId = payload.client_id as string | null;
      return clientId ? `/clients/${clientId}?tab=nutrition` : null;
    }
    return null;
  }

  async function onOpenChange(next: boolean) {
    setOpen(next);
    // Mark read on close, not on open: opening and immediately clearing the
    // badge would hide what the user came to look at.
    if (!next && unread > 0) {
      await markNotificationsReadAction();
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  async function onItemClick() {
    setOpen(false);
    if (unread > 0) {
      await markNotificationsReadAction();
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={<Button variant="outline" size="icon-sm" aria-label={t("label")} />}
      >
        <span className="relative">
          <Bell className="size-4" />
          {unread > 0 && (
            <span
              className="absolute -end-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-destructive text-[10px] leading-none font-medium text-destructive-foreground"
              aria-hidden="true"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        {notifications.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {notifications.map((notification) => {
              const itemClassName = notification.read_at
                ? "block rounded-md p-2 text-sm text-muted-foreground"
                : "block rounded-md bg-muted/60 p-2 text-sm";
              const target = href(notification);
              return (
                <li key={notification.id}>
                  {target ? (
                    <Link href={target} className={`${itemClassName} hover:bg-muted`} onClick={onItemClick}>
                      {message(notification)}
                    </Link>
                  ) : (
                    <span className={itemClassName}>{message(notification)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {push.supported && (
          <>
            <div className="my-2 border-t border-border" />
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              disabled={push.pending}
              onClick={togglePush}
            >
              <BellRing className="size-4" />
              {push.subscribed ? tPush("disable") : tPush("enable")}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
