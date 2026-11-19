"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/domain/locale";
import { durationParts, signedKg } from "@/domain/sites/public-site";
import type { ResultCard } from "@/domain/sites/results.service";
import { formatDate, formatNumber, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requestConsentAction, setCardPublishedAction } from "@/app/[locale]/(coach)/website/actions";
import { ConsentStatusPill } from "./consent-status-pill";
import { CreateCardDialog, type ClientOption } from "./create-card-dialog";

function Thumb({ url, label }: { url: string | null; label: string }) {
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      )}
      <span className="absolute start-1 top-1 rounded bg-black/70 px-1.5 text-xs font-semibold text-white">{label}</span>
    </div>
  );
}

function CardItem({ card }: { card: ResultCard }) {
  const t = useTranslations("websiteEditor.results");
  const tErr = useTranslations("websiteEditor.errors");
  const locale = useLocale() as AppLocale;
  const [pending, startTransition] = useTransition();
  const [published, setPublished] = useOptimistic(card.published);

  const { status } = card.consent;
  const withdrawn = status === "withdrawn";
  const { unit, n } = durationParts(card.durationDays);
  const duration = t(unit, { n });
  const kg = signedKg(card.weightDelta);
  const showId = `show-${card.id}`;

  const fail = (code: string) => toast.error(tErr.has(code as "generic") ? tErr(code as "generic") : tErr("generic"));

  function toggle(next: boolean) {
    startTransition(async () => {
      setPublished(next);
      const res = await setCardPublishedAction(card.id, next);
      if (res?.error) fail(res.error);
    });
  }

  function resend() {
    startTransition(async () => {
      const res = await requestConsentAction(card.id);
      if (res?.error) fail(res.error);
      else toast.success(t("resent"));
    });
  }

  return (
    <li
      className={cn("flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10", withdrawn && "opacity-60")}
      aria-label={t("cardLabel", { name: card.clientName, duration })}
    >
      <div className="grid grid-cols-2 gap-1.5">
        <Thumb url={card.beforeUrl} label={t("before")} />
        <Thumb url={card.afterUrl} label={t("after")} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {/* Full name: this is the coach's private dashboard. */}
          <p className="truncate font-semibold">{card.clientName}</p>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{duration}</span>
            {kg && (
              <>
                {" · "}
                <bdi dir="ltr" className="font-mono">
                  {kg}
                </bdi>{" "}
                kg
              </>
            )}
          </p>
        </div>
        <ConsentStatusPill status={status} />
      </div>

      {status === "agreed" && (
        <label htmlFor={showId} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input id={showId} type="checkbox" className="size-5 accent-primary" checked={published} disabled={pending} onChange={(e) => toggle(e.target.checked)} />
          {t("showOnSite")}
        </label>
      )}

      {status === "pending" && (
        <div className="flex flex-col gap-2">
          <label className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground">
            <input type="checkbox" className="size-5" disabled checked={false} readOnly />
            {t("showOnSite")}
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t("requestSent", { when: formatRelativeTime(card.consent.requestedAt, locale) })}</p>
            <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={pending} onClick={resend}>
              {t("resend")}
            </Button>
          </div>
        </div>
      )}

      {withdrawn && (
        <>
          <label className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground">
            <input type="checkbox" className="size-5" disabled checked={false} readOnly />
            {t("showOnSite")}
          </label>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {t("withdrewNote", {
                name: card.clientName,
                date: formatDate(card.consent.withdrawnAt ?? card.consent.requestedAt, locale, { dateStyle: "medium" }),
              })}
            </span>
          </p>
        </>
      )}
    </li>
  );
}

export function ResultsManager({ cards, clients }: { cards: ResultCard[]; clients: ClientOption[] }) {
  const t = useTranslations("websiteEditor.results");
  const locale = useLocale() as AppLocale;
  const [creating, setCreating] = useState(false);
  const published = cards.filter((c) => c.published).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">{t("info")}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium" aria-live="polite">
          {t("count", { published: formatNumber(published, locale), total: formatNumber(cards.length, locale) })}
        </p>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          {t("newCard")}
        </Button>
      </div>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl p-6 text-center ring-1 ring-foreground/10">
          <h2 className="font-semibold">{t("empty.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("empty.text")}</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <CardItem key={card.id} card={card} />
          ))}
        </ul>
      )}

      <CreateCardDialog open={creating} onOpenChange={setCreating} clients={clients} />
    </div>
  );
}
