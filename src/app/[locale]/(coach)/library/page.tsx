import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { LibraryService } from "@/domain/library/library.service";
import type { AppLocale } from "@/domain/locale";
import { PageTitle } from "@/components/dashboard/page-title";
import { LibraryClient } from "./library-client";

export default async function LibraryPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("library");
  const supabase = await createClient();
  const library = new LibraryService(supabase);

  const [initialExercises, initialFoods] = await Promise.all([
    library.searchExercises({ pageSize: 24 }),
    library.searchFoods({ pageSize: 24 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("title")} />
      <LibraryClient locale={locale} initialExercises={initialExercises} initialFoods={initialFoods} />
    </div>
  );
}
