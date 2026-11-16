import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageTitle } from "@/components/dashboard/page-title";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { asPlanGoal, asPlanLevel } from "@/domain/programs/plan-meta";
import { ProgramsService } from "@/domain/programs/programs.service";
import { AssignTemplateDialog } from "../../[programId]/assign-template-dialog";
import { CustomizeButton, ResetCopyButton } from "../copy-actions";
import { PreviewItem } from "../preview-item";

export default async function TemplatePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale; templateId: string }>;
  searchParams: Promise<{ week?: string }>;
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

  const isPlan = tree.kind === "plan";
  const weeks = isPlan ? Math.max(1, tree.duration_weeks ?? Math.ceil(tree.program_days.length / 7)) : 1;
  // ?week=N picks the week shown; anything out of range falls back rather than erroring
  const requested = Number((await searchParams).week);
  const week = Number.isInteger(requested) && requested >= 1 && requested <= weeks ? requested : 1;

  const copyId = copies.get(tree.id) ?? null;
  const level = asPlanLevel(tree.level);
  const goal = asPlanGoal(tree.goal);
  const gender = tree.gender_target === "female" || tree.gender_target === "male" || tree.gender_target === "all" ? tree.gender_target : null;
  const description = pickLocale(tree, locale, "description");
  const sessionLabel = t("preview.session");

  // a plan shows one week at a time: its 7 days (parent days only), in order
  const shownDays = isPlan
    ? tree.program_days.filter((d) => d.parent_day_id == null && Math.ceil(d.day_index / 7) === week)
    : tree.program_days;

  return (
    <div className="flex flex-col gap-6 max-md:pb-16">
      <PageTitle title={pickLocale(tree, locale, "name")} />

      <header className="flex flex-col gap-3">
        <Link
          href={isPlan ? "/programs/library?kind=plan" : "/programs/library"}
          className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t("title")}
        </Link>
        <h1 className="text-3xl leading-9 font-semibold">{pickLocale(tree, locale, "name")}</h1>
        {description && <p className="max-w-2xl text-base text-muted-foreground">{description}</p>}
        <div className="flex flex-wrap gap-1.5">
          {isPlan && tree.duration_weeks && <Badge variant="outline">{t("card.weeks", { count: tree.duration_weeks })}</Badge>}
          {level && <Badge variant="outline">{tLevels(level)}</Badge>}
          {goal && <Badge variant="outline">{tGoals(goal)}</Badge>}
          {isPlan && gender && <Badge variant="outline">{t(`genders.${gender}`)}</Badge>}
          {tree.days_per_week && <Badge variant="outline">{t("preview.daysPerWeek", { count: tree.days_per_week })}</Badge>}
          {!isPlan &&
            tree.categories.map((c) => (
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
            withStartDate={isPlan}
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

      {isPlan && weeks > 1 && (
        <nav aria-label={t("preview.weekSelector")} className="flex flex-wrap gap-1.5">
          {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
            <Link
              key={w}
              href={`/programs/library/${tree.id}?week=${w}`}
              aria-current={w === week ? "page" : undefined}
              scroll={false}
              className={cn(
                "flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                w === week && "border-transparent bg-primary text-primary-foreground"
              )}
            >
              {t("preview.week", { n: formatNumber(w, locale) })}
            </Link>
          ))}
        </nav>
      )}

      {shownDays.map((day) => {
        const label = pickLocale(day, locale, "label");
        const heading = isPlan
          ? `${t("preview.dayN", { n: formatNumber(day.day_index - (week - 1) * 7, locale) })}${label ? ` · ${label}` : ""}`
          : label || sessionLabel;
        // a plan's rest days are just empty days: one compact row, no exercise list
        if (isPlan && day.program_items.length === 0) {
          return (
            <div key={day.id} className="flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-muted-foreground">
              <span className="font-medium text-foreground">{t("preview.dayN", { n: formatNumber(day.day_index - (week - 1) * 7, locale) })}</span>
              <span>{t("preview.restDay")}</span>
            </div>
          );
        }
        return (
          <section key={day.id} className="flex flex-col gap-3" aria-label={heading}>
            <h2 className="text-xl font-semibold">{heading}</h2>
            <ol className="flex flex-col gap-3">
              {day.program_items.map((item) => (
                <PreviewItem key={item.id} item={item} locale={locale} />
              ))}
            </ol>
          </section>
        );
      })}

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
