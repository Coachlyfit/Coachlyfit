import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/domain/locale";
import { PageTitle } from "@/components/dashboard/page-title";
import { NewFormClient } from "./new-form-client";

export default async function NewFormPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const t = await getTranslations("forms.new");

  return (
    <div className="mx-auto w-full max-w-295">
      <PageTitle title={t("title")} />
      <NewFormClient locale={locale} />
    </div>
  );
}
