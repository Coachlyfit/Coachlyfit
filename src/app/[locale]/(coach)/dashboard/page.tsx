import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/dashboard/page-title";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { getViewerProfile } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { INBOX_FILTERS, type InboxFilter as Filter } from "@/domain/dashboard/coach-home.service";
import type { AppLocale } from "@/domain/locale";
import { AttentionCards, TaskSummary } from "./attention-cards";
import { CheckinInbox } from "./checkin-inbox";
import { HeaderActions } from "./header-actions";
import { InboxFilter } from "./inbox-filter";
import { PaymentsWeek } from "./payments-week";
import { QuietClients } from "./quiet-clients";
import { AttentionSkeleton, HeaderActionsSkeleton, InboxRowsSkeleton, SideCardSkeleton } from "./home-skeletons";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ inbox?: string }>;
}) {
  const { locale } = await params;
  const { inbox } = await searchParams;
  const t = await getTranslations("dashboard");
  const tNav = await getTranslations("nav");
  // Already fetched by the (coach) layout this request -- React.cache hit.
  const profile = await getViewerProfile();

  // Unknown values from a hand-edited URL fall back to "all", not an error.
  const filter: Filter = INBOX_FILTERS.includes(inbox as Filter) ? (inbox as Filter) : "all";
  const now = new Date();

  // Each section streams behind its own Suspense boundary: a slow invoices
  // query shouldn't hold back the inbox.
  return (
    <div className="flex flex-col gap-8">
      <PageTitle title={tNav("dashboard")} />
      <AutoRefresh />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            {formatDate(now, locale, { weekday: "long" })}{" "}
            <span className="font-mono tabular-nums">
              {formatDate(now, locale, { day: "2-digit", month: "2-digit", year: "numeric" })}
            </span>
          </span>
          <h1 className="text-3xl leading-9 font-semibold">
            {profile?.full_name ? t("header.greeting", { name: profile.full_name }) : t("header.greetingNoName")}
          </h1>
          <Suspense fallback={<Skeleton className="h-6 w-56" />}>
            <TaskSummary locale={locale} />
          </Suspense>
        </div>
        <Suspense fallback={<HeaderActionsSkeleton />}>
          <HeaderActions locale={locale} />
        </Suspense>
      </header>

      <section aria-labelledby="attention-h" className="flex flex-col gap-4">
        <h2 id="attention-h" className="text-xl leading-7 font-semibold">
          {t("attention.title")}
        </h2>
        <Suspense fallback={<AttentionSkeleton />}>
          <AttentionCards locale={locale} />
        </Suspense>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="inbox-h" className="min-w-0">
          <Card className="gap-0 py-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h2 id="inbox-h" className="text-xl leading-7 font-semibold">
                {t("inbox.title")}
              </h2>
              <InboxFilter value={filter} />
            </div>
            {/* key: switching filter must show the skeleton again rather
                than leave the previous filter's rows on screen. */}
            <Suspense key={filter} fallback={<InboxRowsSkeleton />}>
              <CheckinInbox locale={locale} filter={filter} />
            </Suspense>
          </Card>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="quiet-h">
            <Suspense fallback={<SideCardSkeleton />}>
              <QuietClients locale={locale} />
            </Suspense>
          </section>
          <section aria-labelledby="payments-h">
            <Suspense fallback={<SideCardSkeleton />}>
              <PaymentsWeek locale={locale} />
            </Suspense>
          </section>
        </div>
      </div>
    </div>
  );
}
