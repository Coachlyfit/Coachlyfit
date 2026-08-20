import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { parseRange } from "@/domain/progress/stats";
import type { AppLocale } from "@/domain/locale";
import { PageTitle } from "@/components/dashboard/page-title";
import { RangePicker } from "./range-picker";
import { ProgressSection } from "./progress-section";
import { ProgressSkeleton } from "./progress-skeleton";
import { WorkoutSection } from "./workout-section";
import { WorkoutSkeleton } from "./workout-skeleton";
import { BillingSection } from "./billing-section";
import { BillingSkeleton } from "./billing-skeleton";
import { ObservationsSection } from "./observations-section";
import { ObservationsSkeleton } from "./observations-skeleton";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale; clientId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { locale, clientId } = await params;
  const { range: rawRange } = await searchParams;
  const range = parseRange(rawRange);
  const tClients = await getTranslations("clients");
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("display_name, email, phone, status")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={client.display_name} subtitle={tClients(`status.${client.status}`)} />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
              {client.display_name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">{client.display_name}</h1>
                <Badge variant={client.status === "active" ? "default" : "secondary"}>
                  {tClients(`status.${client.status}`)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{client.email || client.phone}</p>
            </div>
          </div>
          <RangePicker range={range} />
        </CardContent>
      </Card>

      <Suspense fallback={<BillingSkeleton />}>
        <BillingSection clientId={clientId} locale={locale} />
      </Suspense>

      <Suspense fallback={<ObservationsSkeleton />}>
        <ObservationsSection clientId={clientId} locale={locale} />
      </Suspense>

      <Suspense fallback={<WorkoutSkeleton />}>
        <WorkoutSection clientId={clientId} locale={locale} />
      </Suspense>

      <Suspense key={range} fallback={<ProgressSkeleton />}>
        <ProgressSection clientId={clientId} range={range} locale={locale} />
      </Suspense>
    </div>
  );
}
