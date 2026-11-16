"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { AlertTriangle, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { disconnectGoogleAction } from "@/app/[locale]/(coach)/settings/schedule-actions";

export type GoogleConnectionView = {
  status: "active" | "needs_reconnect" | "revoked";
  email: string | null;
  lastSyncAt: string | null;
};

/** Connect / disconnect Google Calendar. Connecting is a full-page redirect to
 * Google and back (a plain link, not client navigation). `result` is the
 * ?google= status word the callback redirected with. */
export function GoogleCard({
  connection,
  configured,
  result,
}: {
  connection: GoogleConnectionView | null;
  configured: boolean;
  result: string | null;
}) {
  const t = useTranslations("appointments.google");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [deleteCalendar, setDeleteCalendar] = useState(false);

  useEffect(() => {
    if (!result) return;
    if (result === "connected") toast.success(t("result.connected"));
    else toast.error(t.has(`result.${result}`) ? t(`result.${result}`) : t("result.failed"));
    // Drop the status word so a refresh doesn't repeat the toast.
    router.replace("/settings/schedule");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function disconnect() {
    startTransition(async () => {
      const response = await disconnectGoogleAction(locale, deleteCalendar);
      if (response?.error) {
        toast.error(t("result.failed"));
        return;
      }
      toast.success(t("disconnected"));
      setConfirming(false);
      router.refresh();
    });
  }

  const needsReconnect = connection?.status === "needs_reconnect" || connection?.status === "revoked";
  const connectHref = `/api/google/connect?locale=${locale}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t("description")}</p>

        {!connection && (
          <div className="flex flex-wrap items-center gap-3">
            {configured ? (
              <Button nativeButton={false} render={<a href={connectHref} />}>
                {t("connect")}
              </Button>
            ) : (
              <>
                <Button disabled>{t("connect")}</Button>
                <span className="text-sm text-muted-foreground">{t("notConfigured")}</span>
              </>
            )}
          </div>
        )}

        {connection && (
          <>
            <div className="flex items-start gap-2 text-sm">
              {needsReconnect ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              ) : (
                <CalendarCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              )}
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{needsReconnect ? t("needsReconnect") : t("connected")}</span>
                {connection.email && (
                  <span className="truncate text-muted-foreground" dir="ltr">
                    {connection.email}
                  </span>
                )}
                <span className="text-muted-foreground">
                  {connection.lastSyncAt
                    ? t("lastSync", { when: formatDate(connection.lastSyncAt, locale, { dateStyle: "medium", timeStyle: "short" }) })
                    : t("neverSynced")}
                </span>
                {needsReconnect && <span className="text-muted-foreground">{t("needsReconnectHint")}</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {needsReconnect && (
                <Button size="sm" nativeButton={false} render={<a href={connectHref} />}>
                  {t("reconnect")}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
                {t("disconnect")}
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("disconnectTitle")}</DialogTitle>
            <DialogDescription>{t("disconnectHint")}</DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={deleteCalendar} onChange={(event) => setDeleteCalendar(event.target.checked)} />
            {t("deleteCalendar")}
          </label>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t("keep")}</DialogClose>
            <Button variant="destructive" disabled={pending} onClick={disconnect} className="min-w-24">
              {t("disconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
