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
import { PageTitle } from "@/components/dashboard/page-title";
import { LibraryClient } from "./library-client";

export default async function LibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, rawSearch] = await Promise.all([params, searchParams]);
  const t = await getTranslations("library");
  const supabase = await createClient();
  const library = new LibraryService(supabase);

  // Tab, view, filters and page live in the URL, so a refresh has to paint
  // the same slice the coach was looking at — only the active tab's rows,
  // plus both tabs' counts for the tab badges.
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
      <PageTitle title={t("title")} />
      <LibraryClient
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
