import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageTitle } from "@/components/dashboard/page-title";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { resolveExerciseMedia } from "@/lib/video-embed";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { asPlanGoal, asPlanLevel } from "@/domain/programs/plan-meta";
import { ProgramsService } from "@/domain/programs/programs.service";
import { summarizeSets } from "@/domain/programs/platform/library-view";
import { ExerciseMedia } from "../../../library/exercise-card";
import { AssignTemplateDialog } from "../../[programId]/assign-template-dialog";
import { CustomizeButton, ResetCopyButton } from "../copy-actions";

export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; templateId: string }>;
}) {
  const { locale, templateId } = await params;
  const t = await getTranslations("programs.library");
  const tLevels = await getTranslations("programs.levels");
  const tGoals = await getTranslations("programs.goals");

  const supabase = await createClient();
  const service = new ProgramsService(supabase);
  const [tree, copies, { data: clients }] = await Promise.all([
    service.getTree(templateId),
    service.myPlatformCopies(),
    supabase.from("clients").select("id, display_name").neq("status", "archived"),
  ]);
  // RLS only lets a coach read published platform templates; anything else is a 404
  if (!tree || tree.coach_id !== null) notFound();

  const copyId = copies.get(tree.id) ?? null;
  const level = asPlanLevel(tree.level);
  const goal = asPlanGoal(tree.goal);
  const description = pickLocale(tree, locale, "description");
  const fmt = {
    num: (n: number) => formatNumber(n, locale),
    seconds: (n: number) => t("preview.seconds", { value: formatNumber(n, locale) }),
    minutes: (n: number) => t("preview.minutes", { value: formatNumber(n, locale) }),
  };

  return (
    <div className="flex flex-col gap-6 max-md:pb-16">
      <PageTitle title={pickLocale(tree, locale, "name")} />

      <header className="flex flex-col gap-3">
        <Link
          href="/programs/library"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t("title")}
        </Link>
        <h1 className="text-3xl leading-9 font-semibold">{pickLocale(tree, locale, "name")}</h1>
        {description && <p className="max-w-2xl text-base text-muted-foreground">{description}</p>}
        <div className="flex flex-wrap gap-1.5">
          {level && <Badge variant="outline">{tLevels(level)}</Badge>}
          {goal && <Badge variant="outline">{tGoals(goal)}</Badge>}
          {tree.days_per_week && (
            <Badge variant="outline">{t("preview.daysPerWeek", { count: tree.days_per_week })}</Badge>
          )}
          {tree.categories.map((c) => (
            <Badge key={c} variant="secondary">
              {t(`categories.${c}`)}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {copyId ? (
            <>
              <Link href={`/programs/${copyId}`} className={buttonVariants()}>
                {t("preview.openCopy")}
              </Link>
              <ResetCopyButton locale={locale} templateId={tree.id} copyId={copyId} size="default" />
              <CustomizeButton locale={locale} templateId={tree.id} />
            </>
          ) : (
            <CustomizeButton locale={locale} templateId={tree.id} />
          )}
          <AssignTemplateDialog
            locale={locale}
            programId={tree.id}
            clients={clients ?? []}
            trigger={<button type="button" className={buttonVariants({ variant: "outline" })} disabled={!clients?.length} />}
          >
            {t("preview.assign")}
          </AssignTemplateDialog>
        </div>
        {copyId && <p className="text-sm text-muted-foreground">{t("preview.hasCopy")}</p>}
      </header>

      <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t("preview.readOnly")}
      </p>

      {tree.program_days.map((day) => (
        <section key={day.id} className="flex flex-col gap-3" aria-label={pickLocale(day, locale, "label") || t("preview.session")}>
          <h2 className="text-xl font-semibold">{pickLocale(day, locale, "label") || t("preview.session")}</h2>
          <ol className="flex flex-col gap-3">
            {day.program_items.map((item) => {
              const ex = item.exercises;
              const name = pickLocale(ex, locale, "name");
              const still = (ex as { image_url?: string | null }).image_url;
              const media = resolveExerciseMedia(ex.video_url ?? still);
              const summary = summarizeSets(item.program_item_sets, fmt);
              const note = pickLocale(item, locale, "notes");
              return (
                <li key={item.id} className="flex gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:gap-4 sm:p-4">
                  <div className="w-24 shrink-0 sm:w-32">
                    <ExerciseMedia media={media} name={name} className="aspect-square rounded-lg" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{name}</span>
                      {item.block === "warmup" && <Badge variant="secondary">{t("preview.warmup")}</Badge>}
                      {item.group_key && (
                        <Badge variant="outline">
                          {t("preview.superset", { key: formatNumber(Number(item.group_key.replace(/\D/g, "")) || 1, locale) })}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      {summary && (
                        <span dir="ltr" className="font-mono font-semibold text-foreground tabular-nums">
                          {summary}
                        </span>
                      )}
                      {item.rest_seconds ? <span>{t("preview.rest", { value: formatNumber(item.rest_seconds, locale) })}</span> : null}
                    </div>
                    {note && <p className="text-sm text-muted-foreground">{note}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {tree.source_url && (
        <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          {t("preview.source")}
          <a
            href={tree.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-2"
          >
            fitnessprogramer.com
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </p>
      )}
    </div>
  );
}
