import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import { resolveExerciseMedia } from "@/lib/video-embed";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { ProgramTree } from "@/domain/programs/programs.service";
import { summarizeSets } from "@/domain/programs/platform/library-view";
import { ExerciseMedia } from "../../library/exercise-card";

export type PreviewTreeItem = ProgramTree["program_days"][number]["program_items"][number];

/** One read-only exercise row of a template preview: GIF, name, sets x reps, rest, note.
 * Shared by the single-workout and the multi-week plan previews. */
export function PreviewItem({ item, locale }: { item: PreviewTreeItem; locale: AppLocale }) {
  const t = useTranslations("programs.library.preview");
  const ex = item.exercises;
  const name = pickLocale(ex, locale, "name");
  // a still image (no GIF on the site) lives in image_url; the typed join doesn't list it
  const still = (ex as { image_url?: string | null }).image_url;
  const media = resolveExerciseMedia(ex.video_url ?? still);
  const summary = summarizeSets(item.program_item_sets, {
    num: (n) => formatNumber(n, locale),
    seconds: (n) => t("seconds", { value: formatNumber(n, locale) }),
    minutes: (n) => t("minutes", { value: formatNumber(n, locale) }),
    max: () => t("max"),
  });
  const note = pickLocale(item, locale, "notes");

  return (
    <li className="flex gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:gap-4 sm:p-4">
      <div className="w-24 shrink-0 sm:w-32">
        <ExerciseMedia media={media} name={name} className="aspect-square rounded-lg" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{name}</span>
          {item.block === "warmup" && <Badge variant="secondary">{t("warmup")}</Badge>}
          {item.group_key && (
            <Badge variant="outline">
              {t("superset", { key: formatNumber(Number(item.group_key.replace(/\D/g, "")) || 1, locale) })}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {summary && (
            <span dir="ltr" className="font-mono font-semibold text-foreground tabular-nums">
              {summary}
            </span>
          )}
          {item.rest_seconds ? <span>{t("rest", { value: formatNumber(item.rest_seconds, locale) })}</span> : null}
        </div>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </div>
    </li>
  );
}
