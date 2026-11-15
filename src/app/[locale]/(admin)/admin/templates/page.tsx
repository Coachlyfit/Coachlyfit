import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/dashboard/page-title";
import { createClient } from "@/lib/supabase/server";
import type { AppLocale } from "@/domain/locale";
import { TemplatesAdminClient, type AdminTemplate } from "./templates-admin-client";

export default async function AdminTemplatesPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const t = await getTranslations("admin.templates");

  // The admin policy shows unpublished rows too; `coach_id is null` keeps the list to platform templates.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("programs")
    .select(
      "id, slug, name_ar, name_en, description_ar, description_en, level, categories, days_per_week, published, program_days(program_items(count))"
    )
    .is("coach_id", null)
    .order("name_en");
  if (error) throw error;

  const templates: AdminTemplate[] = data.map((p) => ({
    id: p.id,
    slug: p.slug ?? "",
    name_ar: p.name_ar,
    name_en: p.name_en,
    description_ar: p.description_ar,
    description_en: p.description_en,
    level: p.level,
    categories: p.categories,
    days_per_week: p.days_per_week,
    published: p.published,
    exercises: p.program_days.reduce((n, d) => n + (d.program_items[0]?.count ?? 0), 0),
  }));

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={t("title")} />
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl leading-9 font-semibold">{t("heading")}</h1>
        <p className="max-w-2xl text-base text-muted-foreground">{t("subtitle")}</p>
      </header>
      <TemplatesAdminClient locale={locale} templates={templates} />
    </div>
  );
}
