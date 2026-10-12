import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getFeatures } from "@/lib/features";
import type { AppLocale } from "@/domain/locale";
import { PageTitle } from "@/components/dashboard/page-title";
import { NewFormClient } from "./new-form-client";

export default async function NewFormPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  // Same rule as the list page, which shows the upgrade prompt in place of
  // the "new" button: the first form is free, more need forms_builder.
  if (!(await getFeatures()).forms_builder) {
    const supabase = await createClient();
    const { count } = await supabase.from("form_templates").select("id", { count: "exact", head: true });
    if (count) redirect(`/${locale}/forms`);
  }
  const t = await getTranslations("forms.new");

  return (
    <div className="mx-auto w-full max-w-295">
      <PageTitle title={t("title")} />
      <NewFormClient locale={locale} />
    </div>
  );
}
