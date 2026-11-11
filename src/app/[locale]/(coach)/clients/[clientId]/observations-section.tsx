import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link2, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { ObservationsService } from "@/domain/clients/observations.service";
import type { ObservationCategory, ObservationLinkType, ObservationSeverity } from "@/domain/clients/observations";
import type { AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { ObservationDialog, type EditableObservation } from "./observation-dialog";
import { DeleteObservationButton } from "./delete-observation-button";

const SEVERITY_VARIANT = { low: "info", medium: "warning", high: "destructive" } as const;

export async function ObservationsSection({ clientId, locale }: { clientId: string; locale: AppLocale }) {
  const t = await getTranslations("clients.observations");
  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) notFound();

  const service = new ObservationsService(supabase);
  const observations = await service.list(clientId);
  const [imageUrls, linkLabels] = await Promise.all([
    service.signImageUrls(observations.flatMap((o) => (o.image_path ? [o.image_path] : []))),
    service.linkLabels(observations, locale),
  ]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
        <ObservationDialog locale={locale} clientId={clientId} coachId={coachId} />
      </div>
      {observations.length === 0 ? (
        <Card>
          <CardContent className="py-2">
            <EmptyState icon={StickyNote} title={t("empty")} />
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {observations.map((obs) => {
            const linked =
              obs.linked_type && obs.linked_id
                ? { type: obs.linked_type as ObservationLinkType, id: obs.linked_id }
                : null;
            const rawLabel = linked ? linkLabels.get(`${linked.type}:${linked.id}`) : undefined;
            const linkLabel = rawLabel && linked?.type === "check_in" ? formatDate(rawLabel, locale) : (rawLabel ?? null);
            const imageUrl = obs.image_path ? (imageUrls.get(obs.image_path) ?? null) : null;
            const editable: EditableObservation = {
              id: obs.id,
              title: obs.title,
              category: obs.category as ObservationCategory,
              severity: obs.severity as ObservationSeverity | null,
              details: obs.details ?? "",
              linked,
              image_path: obs.image_path,
              linkLabel,
              imageUrl,
            };
            return (
              <Card key={obs.id}>
                <CardContent className="flex items-start justify-between gap-3 py-3">
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{obs.title}</p>
                      <Badge variant="secondary">{t(`category.${editable.category}`)}</Badge>
                      {editable.severity && (
                        <Badge variant={SEVERITY_VARIANT[editable.severity]}>{t(`severity.${editable.severity}`)}</Badge>
                      )}
                    </div>
                    {obs.details && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{obs.details}</p>}
                    {imageUrl && (
                      <a href={imageUrl} target="_blank" rel="noreferrer" className="w-fit">
                        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                        <img src={imageUrl} alt="" className="size-20 rounded-md border border-border object-cover" />
                      </a>
                    )}
                    {linked && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Link2 className="size-3.5" aria-hidden="true" />
                        {t(`link.${linked.type}`)}: {linkLabel ?? t("link.unavailable")}
                      </p>
                    )}
                    <p className="font-mono text-xs text-muted-foreground">{formatDate(obs.created_at, locale)}</p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <ObservationDialog
                      locale={locale}
                      clientId={clientId}
                      coachId={coachId}
                      observation={editable}
                    />
                    <DeleteObservationButton locale={locale} clientId={clientId} observationId={obs.id} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
