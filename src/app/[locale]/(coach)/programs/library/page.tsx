import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageTitle } from "@/components/dashboard/page-title";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppLocale } from "@/domain/locale";
import { ProgramsService } from "@/domain/programs/programs.service";
import type { LibraryRow, TemplateKind } from "@/domain/programs/platform/library-view";
import { LibraryClient } from "./library-client";

export default async function TemplateLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { locale } = await params;
  // anything but ?kind=plan is the workouts tab (a hand-edited URL falls back, it doesn't error)
  const kind: TemplateKind = (await searchParams).kind === "plan" ? "plan" : "workout";
  const t = await getTranslations("programs.library");

  const service = new ProgramsService(await createClient());
  const [templates, copies] = await Promise.all([service.listPlatformTemplates(), service.myPlatformCopies()]);

  const all: LibraryRow[] = templates.map((p) => ({
    id: p.id,
    kind: p.kind === "plan" ? "plan" : "workout",
    name_ar: p.name_ar,
    name_en: p.name_en,
    description_ar: p.description_ar,
    description_en: p.description_en,
    level: p.level,
    goal: p.goal,
    categories: p.categories,
    equipment: p.equipment,
    exercises: p.program_days.reduce((n, d) => n + (d.program_items[0]?.count ?? 0), 0),
    days_per_week: p.days_per_week,
    duration_weeks: p.duration_weeks,
    gender_target: p.gender_target,
    copyId: copies.get(p.id) ?? null,
  }));
  const counts = { workout: all.filter((r) => r.kind === "workout").length, plan: all.filter((r) => r.kind === "plan").length };

  return (
    <div className="flex flex-col gap-5 max-md:pb-16">
      <PageTitle title={t("title")} />
      <header className="flex flex-col gap-3">
        <Link href="/programs" className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}>
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t("backToPrograms")}
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl leading-9 font-semibold">{t("heading")}</h1>
          <p className="max-w-2xl text-base text-muted-foreground">{t("subtitle")}</p>
        </div>
      </header>
      <LibraryClient key={kind} locale={locale} kind={kind} counts={counts} rows={all.filter((r) => r.kind === kind)} />
    </div>
  );
}
