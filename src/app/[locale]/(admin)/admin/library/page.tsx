import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { LibraryService } from "@/domain/library/library.service";
import {
  exerciseQuery,
  foodQuery,
  parseLibraryParams,
  serializeLibraryParams,
} from "@/domain/library/library-params";
import type { AppLocale } from "@/domain/locale";
import { LibraryAdminClient } from "./library-admin-client";

export default async function AdminLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, rawSearch] = await Promise.all([params, searchParams]);
  const t = await getTranslations("admin.library");
  const supabase = await createClient();
  const library = new LibraryService(supabase);

  // admin_read_all makes this return every coach's rows too, which is the
  // point — the admin needs them to find promotion candidates.
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(rawSearch)) {
    if (typeof value === "string") search.set(key, value);
  }
  const state = parseLibraryParams(search);

  const [initialExercises, initialFoods, initialExerciseFacets, initialFoodFacets] = await Promise.all([
    state.tab === "exercises" ? library.searchExercises(exerciseQuery(state)) : null,
    state.tab === "foods" ? library.searchFoods(foodQuery(state)) : null,
    library.exerciseFacets({ query: state.q, source: state.source, equipment: state.equip }),
    library.foodFacets({ query: state.q, source: state.source }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <LibraryAdminClient
        locale={locale}
        initialKey={serializeLibraryParams(state)}
        initialExercises={initialExercises}
        initialFoods={initialFoods}
        initialExerciseFacets={initialExerciseFacets}
        initialFoodFacets={initialFoodFacets}
      />
    </div>
  );
}
