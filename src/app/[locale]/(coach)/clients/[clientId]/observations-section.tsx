import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { ObservationsService } from "@/domain/clients/observations.service";
import type { AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { AddObservationDialog } from "./add-observation-dialog";
import { DeleteObservationButton } from "./delete-observation-button";

export async function ObservationsSection({ clientId, locale }: { clientId: string; locale: AppLocale }) {
  const t = await getTranslations("clients.observations");
  const supabase = await createClient();
  const observations = await new ObservationsService(supabase).list(clientId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
        <AddObservationDialog locale={locale} clientId={clientId} />
      </div>
      {observations.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {observations.map((obs) => (
            <Card key={obs.id}>
              <CardContent className="flex items-start justify-between gap-3 py-3">
                <div className="flex flex-col gap-1">
                  <p className="text-sm whitespace-pre-wrap">{obs.body}</p>
                  <p className="font-mono text-xs text-muted-foreground">{formatDate(obs.created_at, locale)}</p>
                </div>
                <DeleteObservationButton locale={locale} clientId={clientId} observationId={obs.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
