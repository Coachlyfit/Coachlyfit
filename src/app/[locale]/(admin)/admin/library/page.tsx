import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { LibraryService } from "@/domain/library/library.service";
import type { AppLocale } from "@/domain/locale";
import { LibraryAdminClient } from "./library-admin-client";

export default async function AdminLibraryPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("admin.library");
  const supabase = await createClient();
  const library = new LibraryService(supabase);

  // admin_read_all makes this return every coach's rows too, which is the
  // point — the admin needs them to find promotion candidates.
  const [initialExercises, initialFoods] = await Promise.all([
    library.searchExercises(""),
    library.searchFoods(""),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <LibraryAdminClient
        locale={locale}
        initialExercises={initialExercises}
        initialFoods={initialFoods}
      />
    </div>
  );
}
