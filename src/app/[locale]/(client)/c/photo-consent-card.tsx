"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { respondToCardConsentAction, withdrawCardConsentAction } from "./consent-actions";

export type PhotoConsentRequest = {
  cardId: string;
  status: "pending" | "agreed";
  coachName: string;
  beforeUrl: string | null;
  afterUrl: string | null;
};

/** What the client agreed to (or is being asked to) share on the coach's
 * website, with the two photos, and a Withdraw button that works at any time. */
export function PhotoConsentCard({ locale, request }: { locale: string; request: PhotoConsentRequest }) {
  const t = useTranslations("photoConsent");
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error: string } | void>, ok: string) {
    startTransition(async () => {
      const res = await action();
      if (res?.error) toast.error(t("error"));
      else toast.success(ok);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div>
          <h2 className="text-base font-semibold">{request.status === "pending" ? t("askTitle") : t("agreedTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {request.status === "pending" ? t("askText", { coach: request.coachName }) : t("agreedText", { coach: request.coachName })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {[
            { url: request.beforeUrl, label: t("before") },
            { url: request.afterUrl, label: t("after") },
          ].map(({ url, label }) => (
            <div key={label} className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted">
              {url && (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                <img src={url} alt="" className="size-full object-cover" loading="lazy" />
              )}
              <span className="absolute start-1 top-1 rounded bg-black/70 px-1.5 text-xs font-semibold text-white">{label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {request.status === "pending" ? (
            <>
              <Button type="button" className="min-h-11" disabled={pending} onClick={() => run(() => respondToCardConsentAction(locale, { cardId: request.cardId, agree: true }), t("agreed"))}>
                {t("agree")}
              </Button>
              <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => run(() => respondToCardConsentAction(locale, { cardId: request.cardId, agree: false }), t("declined"))}>
                {t("decline")}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => run(() => withdrawCardConsentAction(locale, { cardId: request.cardId }), t("withdrawn"))}>
              {t("withdraw")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
