import { getTranslations } from "next-intl/server";
import { Camera } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";

export type TimelinePhoto = { id: string; url: string; createdAt: string; pose?: string | null };

/** Chronological grid, not a before/after slider — first and last photo
 * are both visible without configuring a comparator. `emptyAction` is the
 * upload button on the client page; the coach page passes none, since
 * media RLS is coach-read-only. */
export async function PhotoTimeline({
  photos,
  locale,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  photos: TimelinePhoto[];
  locale: AppLocale;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
}) {
  const t = await getTranslations("progress.photos");

  if (photos.length === 0) {
    return <EmptyState icon={Camera} title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((photo) => (
        <figure key={photo.id} className="flex flex-col gap-1">
          <img
            src={photo.url}
            alt={t("alt", { date: formatDate(photo.createdAt, locale) })}
            loading="lazy"
            decoding="async"
            className="aspect-[3/4] w-full rounded-md object-cover"
          />
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
