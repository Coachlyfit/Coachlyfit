"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { COACH_STAGES, type CoachStage } from "@/domain/billing/coach-stage";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import { Amount, CoachAction, CoachAvatar, CoachNoteText, PlanBadge, STAGE_DOT } from "./coach-bits";
import { CoachCompactCard } from "./coaches-cards";
import { Link } from "@/i18n/navigation";
import type { CoachView } from "./types";

/** Read-only lifecycle board: a coach's lane is their subscription status,
 * which only record_payment() and the billing cron change -- so there is
 * nothing to drag. Coaches with no subscription row have no lane and only
 * appear in the list and cards views. */
export function CoachesKanban({ locale, coaches }: { locale: AppLocale; coaches: CoachView[] }) {
  const t = useTranslations("admin.coaches");
  const tHome = useTranslations("admin.home");
  const [lane, setLane] = useState<CoachStage>("pastDue");

  const lanes = COACH_STAGES.map((stage) => {
    const items = coaches.filter((c) => c.stage === stage);
    return { stage, items, sum: items.reduce((total, c) => total + (c.amount ?? 0), 0) };
  });
  const current = lanes.find((l) => l.stage === lane)!;
  const empty = <p className="px-3 py-3.5 text-center text-muted-foreground">{t("lane.empty")}</p>;

  return (
    <>
      <div className="hidden grid-cols-[repeat(auto-fit,minmax(220px,1fr))] items-start gap-3 px-4 pb-4 md:grid">
        {lanes.map(({ stage, items, sum }) => (
          <section key={stage} aria-label={t(`stage.${stage}`)} className="flex flex-col gap-2 rounded-xl bg-muted p-2.5">
            <div className="flex items-center justify-between gap-2 px-1 py-0.5">
              <span className="flex items-center gap-2 font-semibold">
                <span className={cn("size-2.5 rounded-full", STAGE_DOT[stage])} aria-hidden="true" />
                {t(`stage.${stage}`)}
                <span className="font-mono font-medium text-muted-foreground tabular-nums">
                  {formatNumber(items.length, locale)}
                </span>
              </span>
              {sum > 0 && (
                <span className="font-mono text-[0.8125rem] text-muted-foreground tabular-nums">
                  {formatNumber(sum, locale)} {tHome("currency")}
                </span>
              )}
            </div>
            {items.map((coach) => (
              <article key={coach.id} className="flex flex-col gap-2 rounded-lg bg-card px-3 py-2.5 ring-1 ring-foreground/10">
                <div className="flex items-center gap-2">
                  <CoachAvatar coach={coach} />
                  <Link
                    href={`/admin/coaches/${coach.id}`}
                    className="min-w-0 flex-1 truncate font-semibold hover:underline"
                  >
                    {coach.name}
                  </Link>
                  <PlanBadge tier={coach.tier} />
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <CoachNoteText coach={coach} locale={locale} />
                  <Amount value={coach.amount} complimentary={coach.complimentary} locale={locale} className="ms-auto font-semibold" />
                </div>
                <CoachAction coach={coach} locale={locale} className="w-full" />
              </article>
            ))}
            {items.length === 0 && empty}
          </section>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 px-4 pb-4 md:hidden">
        <div role="group" aria-label={t("lane.label")} className="grid grid-cols-4 gap-1.5">
          {lanes.map(({ stage, items }) => (
            <button
              key={stage}
              type="button"
              aria-pressed={lane === stage}
              onClick={() => setLane(stage)}
              className="flex h-15 flex-col items-center justify-center rounded-xl bg-card leading-snug ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:ring-2 aria-pressed:ring-primary"
            >
              <span className="flex items-center gap-1 text-[0.8125rem] font-medium">
                <span className={cn("size-2 shrink-0 rounded-full", STAGE_DOT[stage])} aria-hidden="true" />
                {t(`stageShort.${stage}`)}
              </span>
              <span className="font-mono font-semibold tabular-nums">{formatNumber(items.length, locale)}</span>
            </button>
          ))}
        </div>
        {current.sum > 0 && (
          <p className="text-muted-foreground">
            <span className="font-mono tabular-nums">{formatNumber(current.sum, locale)}</span> {tHome("currency")}
          </p>
        )}
        {current.items.map((coach) => (
          <CoachCompactCard key={coach.id} locale={locale} coach={coach} />
        ))}
        {current.items.length === 0 && empty}
      </div>
    </>
  );
}
