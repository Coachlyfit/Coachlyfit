"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatDate, formatNumber } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { Amount, CoachAction, CoachAvatar, CoachNoteText, PlanBadge, StageBadge } from "./coach-bits";
import type { CoachView } from "./types";

const num = (chunks: React.ReactNode) => <span className="font-mono text-foreground tabular-nums">{chunks}</span>;

/** Phone-width card (mobile mockup): one line of facts, full-width action.
 * Also what the list view falls back to below md, where a 7-column table
 * can't fit. */
export function CoachCompactCard({ locale, coach }: { locale: AppLocale; coach: CoachView }) {
  const t = useTranslations("admin.coaches");
  return (
    <article className="flex flex-col gap-2.5 rounded-xl bg-card px-3.5 py-3 ring-1 ring-foreground/10">
      <div className="flex items-center gap-2.5">
        <CoachAvatar coach={coach} />
        <div className="flex min-w-0 flex-1 flex-col leading-snug">
          <Link href={`/admin/coaches/${coach.id}`} className="truncate font-semibold hover:underline">
            {coach.name}
          </Link>
          <CoachNoteText coach={coach} locale={locale} />
        </div>
        <StageBadge stage={coach.stage} />
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <PlanBadge tier={coach.tier} />
        <span>
          {t.rich("clientsCount", { count: coach.clients, value: formatNumber(coach.clients, locale), num })}
        </span>
        <Amount value={coach.amount} locale={locale} className="ms-auto font-semibold text-foreground" />
      </div>
      <CoachAction coach={coach} locale={locale} className="h-11 w-full" />
    </article>
  );
}

export function CoachesCards({ locale, coaches }: { locale: AppLocale; coaches: CoachView[] }) {
  const t = useTranslations("admin.coaches");

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 px-4 pb-4">
      {coaches.map((coach) => (
        <article key={coach.id} className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="flex items-center gap-2.5">
            <CoachAvatar coach={coach} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col leading-snug">
              <Link href={`/admin/coaches/${coach.id}`} className="truncate font-semibold hover:underline">
                {coach.name}
              </Link>
              {coach.owner && (
                <span className="truncate text-[0.8125rem] text-muted-foreground">{coach.owner}</span>
              )}
            </div>
            <StageBadge stage={coach.stage} />
          </div>

          <dl className="grid grid-cols-3 gap-1.5">
            <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-2">
              <dt className="text-xs text-muted-foreground">{t("table.tier")}</dt>
              <dd>
                <PlanBadge tier={coach.tier} />
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-2">
              <dt className="text-xs text-muted-foreground">{t("table.monthlyShort")}</dt>
              <dd>
                <Amount value={coach.amount} locale={locale} className="text-base font-semibold" />
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-2">
              <dt className="text-xs text-muted-foreground">{t("table.clients")}</dt>
              <dd className="font-mono text-base font-semibold tabular-nums">{formatNumber(coach.clients, locale)}</dd>
            </div>
          </dl>

          <div className="mt-auto flex items-center gap-2 border-t border-border pt-2.5">
            <div className="flex min-w-0 flex-1 flex-col leading-snug">
              <CoachNoteText coach={coach} locale={locale} className="font-medium" />
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {coach.periodEnd ? formatDate(coach.periodEnd, locale) : "—"}
              </span>
            </div>
            <CoachAction coach={coach} locale={locale} />
          </div>
        </article>
      ))}
    </div>
  );
}
