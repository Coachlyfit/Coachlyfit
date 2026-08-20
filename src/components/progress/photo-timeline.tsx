import { getTranslations } from "next-intl/server";
import { Camera } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DeletePhotoButton } from "./delete-photo-button";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";

export type TimelinePhoto = { id: string; url: string; createdAt: string; pose?: string | null };

/** Chronological grid, not a before/after slider — first and last photo
 * are both visible without configuring a comparator. `emptyAction` is the
 * upload button on the client page; the coach page passes none, since
 * media RLS is coach-read-only for everything except delete.
 * `deletable` (coach view only — see coach_delete policy,
 * 20260810000001_media_coach_delete.sql) overlays a delete button per photo;
 * `clientId` is required alongside it so the action can revalidate the
 * right page. */
export async function PhotoTimeline({
  photos,
  locale,
  emptyTitle,
  emptyDescription,
  emptyAction,
  deletable,
  clientId,
}: {
  photos: TimelinePhoto[];
  locale: AppLocale;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
  deletable?: boolean;
  clientId?: string;
}) {
  const t = await getTranslations("progress.photos");

  if (photos.length === 0) {
    return <EmptyState icon={Camera} title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((photo) => (
        <figure key={photo.id} className="relative flex flex-col gap-1">
          <img
            src={photo.url}
            alt={t("alt", { date: formatDate(photo.createdAt, locale) })}
            loading="lazy"
            decoding="async"
            className="aspect-[3/4] w-full rounded-md object-cover"
          />
          {deletable && clientId && <DeletePhotoButton locale={locale} clientId={clientId} mediaId={photo.id} />}
          <figcaption className="text-center text-xs text-muted-foreground tabular-nums">
            {photo.pose === "front" || photo.pose === "side" || photo.pose === "back"
              ? `${t(`pose.${photo.pose}`)} · `
              : ""}
            {formatDate(photo.createdAt, locale, { month: "short", day: "numeric" })}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
