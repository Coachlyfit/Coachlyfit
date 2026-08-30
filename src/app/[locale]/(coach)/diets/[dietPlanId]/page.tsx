import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { DietPlanBuilder } from "./diet-plan-builder";

export default async function DietPlanDetailPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; dietPlanId: string }>;
}) {
  const { locale, dietPlanId } = await params;
  const t = await getTranslations("diets");
  const supabase = await createClient();

  const [tree, { data: clients }] = await Promise.all([
    new DietPlansService(supabase).getTree(dietPlanId),
    supabase.from("clients").select("id, display_name").neq("status", "archived"),
  ]);
  if (!tree) notFound();

  const isTemplate = !tree.client_id;
  const clonedInstances = isTemplate ? await new DietPlansService(supabase).listClonedInstances(tree.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{pickLocale(tree, locale)}</h1>
            <p className="text-sm text-muted-foreground">
              {isTemplate
                ? t("template")
                : tree.end_date
                  ? t("dateRange", {
                      start: formatDate(tree.start_date, locale),
                      end: formatDate(tree.end_date, locale),
                    })
                  : `${formatDate(tree.start_date, locale)} · ${t("ongoing")}`}
            </p>
          </div>
          {isTemplate && <Badge variant="secondary">{t("template")}</Badge>}
        </div>
        <Link href="/diets" className="text-sm text-muted-foreground hover:text-foreground">
          {t("title")}
        </Link>
      </div>

      {isTemplate && clonedInstances.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm font-medium">{t("assignedToClients.title", { count: clonedInstances.length })}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {clonedInstances.map((instance) => (
              <li key={instance.id}>
                <Link
                  href={`/diets/${instance.id}`}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {instance.clients?.display_name ?? "—"}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DietPlanBuilder
        // Same remount-on-mutation trick as programs/[programId]/page.tsx:
        // keyed on a signature of every meal+item id so a server mutation
        // (via revalidatePath) resets local state instead of syncing props.
        key={tree.meals.map((m) => `${m.id}:${m.meal_items.map((i) => i.id).join(",")}`).join("|")}
        locale={locale}
        tree={tree}
        clients={clients ?? []}
        isTemplate={isTemplate}
      />
    </div>
  );
}
