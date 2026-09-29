import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { DietPlansService } from "@/domain/nutrition/diet-plans.service";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { DietPlanBuilder } from "./diet-plan-builder";
import { PlanToolbar } from "./plan-toolbar";
import { VariantTabs } from "./variant-tabs";

export default async function DietPlanDetailPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; dietPlanId: string }>;
}) {
  const { locale, dietPlanId } = await params;
  const t = await getTranslations("diets");
  const supabase = await createClient();
  const service = new DietPlansService(supabase);

  const [tree, { data: clients }] = await Promise.all([
    service.getTree(dietPlanId),
    supabase.from("clients").select("id, display_name").neq("status", "archived"),
  ]);
  if (!tree) notFound();

  const isTemplate = !tree.client_id;
  const [clonedInstances, siblings] = await Promise.all([
    isTemplate && !tree.program_id ? service.listClonedInstances(tree.id) : [],
    tree.program_id ? service.listSiblingVariants(tree.program_id) : [],
  ]);
  const clientName = clients?.find((c) => c.id === tree.client_id)?.display_name;
  const BackIcon = locale === "ar" ? ChevronRight : ChevronLeft;

  const subtitle = [
    tree.program_id ? t("variantOfProgram") : isTemplate ? t("template") : clientName,
    !tree.program_id && !isTemplate
      ? tree.end_date
        ? t("dateRange", { start: formatDate(tree.start_date, locale), end: formatDate(tree.end_date, locale) })
        : `${formatDate(tree.start_date, locale)} · ${t("ongoing")}`
      : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={tree.program_id ? `/programs/${tree.program_id}` : "/diets"}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <BackIcon className="size-4" aria-hidden="true" />
        {tree.program_id ? t("backToProgram") : t("title")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{pickLocale(tree, locale)}</h1>
            {isTemplate && !tree.program_id && <Badge variant="secondary">{t("template")}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{subtitle.join(" · ")}</p>
        </div>
        <PlanToolbar locale={locale} plan={tree} clients={clients ?? []} />
      </div>

      {tree.program_id && siblings.length > 0 && (
        <VariantTabs locale={locale} currentId={tree.id} programId={tree.program_id} variants={siblings} />
      )}

      {(tree.notes_ar || tree.notes_en) && (
        <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="line-clamp-2 whitespace-pre-line text-muted-foreground">{pickLocale(tree, locale, "notes")}</p>
        </div>
      )}

      {isTemplate && clonedInstances.length > 0 && (
        <details className="rounded-lg border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t("assignedToClients.title", { count: clonedInstances.length })}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {clonedInstances.map((instance) => (
              <li key={instance.id}>
                <Link href={`/diets/${instance.id}`} className="text-sm text-muted-foreground hover:text-foreground">
                  {instance.clients?.display_name ?? "—"}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <DietPlanBuilder
        locale={locale}
        tree={tree}
        copyTargets={siblings.filter((v) => v.id !== tree.id).map((v) => ({ id: v.id, name: pickLocale(v, locale) }))}
      />
    </div>
  );
}
