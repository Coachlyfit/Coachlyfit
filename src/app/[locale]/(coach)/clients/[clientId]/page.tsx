import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { parseRange } from "@/domain/progress/stats";
import type { AppLocale } from "@/domain/locale";
import { PageTitle } from "@/components/dashboard/page-title";
import { ClientHeader } from "./client-header";
import { AttentionStrip } from "./attention-strip";
import { AttentionSkeleton } from "./attention-skeleton";
import { TrainingCard } from "./training-card";
import { NutritionCard } from "./nutrition-card";
import { TrainingSkeleton } from "./training-skeleton";
import { ClientTabs, type ClientTab } from "./client-tabs";
import { RangePicker } from "./range-picker";
import { ProgressSection } from "./progress-section";
import { ProgressSkeleton } from "./progress-skeleton";
import { WorkoutSection } from "./workout-section";
import { WorkoutSkeleton } from "./workout-skeleton";
import { DecisionsSection } from "./decisions-section";
import { DecisionsSkeleton } from "./decisions-skeleton";
import { BillingSection } from "./billing-section";
import { BillingSkeleton } from "./billing-skeleton";
import { ObservationsSection } from "./observations-section";
import { ObservationsSkeleton } from "./observations-skeleton";
import { NutritionSection } from "./nutrition-section";
import { parseMonth } from "@/domain/nutrition/adherence";
import { getClientAccountState } from "@/domain/clients/client-account";

const TABS: ClientTab[] = ["progress", "nutrition", "sessions", "decisions", "billing", "notes"];

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale; clientId: string }>;
  searchParams: Promise<{ range?: string; tab?: string; month?: string }>;
}) {
  const { locale, clientId } = await params;
  const { range: rawRange, tab: rawTab, month: rawMonth } = await searchParams;
  const range = parseRange(rawRange);
  const tab: ClientTab = TABS.includes(rawTab as ClientTab) ? (rawTab as ClientTab) : "progress";
  const tClients = await getTranslations("clients");
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, display_name, email, phone, status, created_at, profile_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) notFound();
  const { profile_id, ...headerClient } = client;
  const account = await getClientAccountState(profile_id);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={client.display_name} subtitle={tClients(`status.${client.status}`)} />

      <ClientHeader locale={locale} client={headerClient} account={account} />

      <Suspense fallback={<AttentionSkeleton />}>
        <AttentionStrip clientId={clientId} />
      </Suspense>

      <div className="grid gap-4 md:grid-cols-2">
        <Suspense fallback={<TrainingSkeleton />}>
          <TrainingCard clientId={clientId} locale={locale} />
        </Suspense>
        <Suspense fallback={<TrainingSkeleton />}>
          <NutritionCard clientId={clientId} locale={locale} />
        </Suspense>
      </div>

      <ClientTabs active={tab}>
        {tab === "progress" && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <RangePicker range={range} />
            </div>
            <Suspense key={range} fallback={<ProgressSkeleton />}>
              <ProgressSection clientId={clientId} range={range} locale={locale} />
            </Suspense>
          </div>
        )}
        {tab === "nutrition" && (
          <Suspense key={rawMonth} fallback={<ProgressSkeleton />}>
            <NutritionSection
              clientId={clientId}
              month={parseMonth(rawMonth, new Date().toISOString().slice(0, 10))}
              locale={locale}
            />
          </Suspense>
        )}
        {tab === "sessions" && (
          <Suspense fallback={<WorkoutSkeleton />}>
            <WorkoutSection clientId={clientId} locale={locale} />
          </Suspense>
        )}
        {tab === "decisions" && (
          <Suspense fallback={<DecisionsSkeleton />}>
            <DecisionsSection clientId={clientId} locale={locale} />
          </Suspense>
        )}
        {tab === "billing" && (
          <Suspense fallback={<BillingSkeleton />}>
            <BillingSection clientId={clientId} locale={locale} />
          </Suspense>
        )}
        {tab === "notes" && (
          <Suspense fallback={<ObservationsSkeleton />}>
            <ObservationsSection clientId={clientId} locale={locale} />
          </Suspense>
        )}
      </ClientTabs>
    </div>
  );
}
