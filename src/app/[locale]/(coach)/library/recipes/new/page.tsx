import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { getRequestCoachId } from "@/lib/auth/session";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/domain/locale";
import { PageTitle } from "@/components/dashboard/page-title";
import { RecipeForm } from "../recipe-form";

export default async function NewRecipePage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const [t, coachId] = await Promise.all([getTranslations("recipes"), getRequestCoachId()]);
  if (!coachId) notFound();

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={t("newTitle")} />
      <Link
        href="/library?tab=recipes"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {t("backToLibrary")}
      </Link>
      <RecipeForm locale={locale} coachId={coachId} initial={null} />
    </div>
  );
}
