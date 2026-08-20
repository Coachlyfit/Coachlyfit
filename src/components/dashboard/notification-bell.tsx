"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { Notification } from "@/domain/notifications/notifications.service";
import { listNotificationsAction, markNotificationsReadAction } from "./notifications-actions";

const KINDS = ["exercise_promoted", "food_promoted", "new_message"] as const;

function isKnownKind(kind: string): kind is (typeof KINDS)[number] {
  return (KINDS as readonly string[]).includes(kind);
}

export function NotificationBell({ locale }: { locale: AppLocale }) {
  const t = useTranslations("notifications");
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotificationsAction,
  });

  const unread = notifications.filter((n) => !n.read_at).length;

  function message(notification: Notification) {
    if (!isKnownKind(notification.kind)) return t("unknown");
    // payload is jsonb, so it arrives as an untyped object — pickLocale
    // reads the same name_ar/name_en pair the promote function wrote.
    const payload = (notification.payload ?? {}) as Record<string, unknown>;
    return t(notification.kind, { name: pickLocale(payload, locale) });
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
      <PopoverContent align="end" className="w-80">
        {notifications.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className={
                  notification.read_at
                    ? "rounded-md p-2 text-sm text-muted-foreground"
                    : "rounded-md bg-muted/60 p-2 text-sm"
                }
              >
                {message(notification)}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
