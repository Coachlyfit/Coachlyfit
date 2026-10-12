import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { getFeatures } from "@/lib/features";
import { TemplatesService } from "@/domain/forms/templates.service";
import { FORM_KINDS, type FormKind } from "@/domain/forms/schema";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { PageTitle } from "@/components/dashboard/page-title";
import { UpgradePrompt } from "@/components/dashboard/upgrade-prompt";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { FormsClient, type KindFilter } from "./forms-client";

export default async function FormsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { locale } = await params;
  const { kind: rawKind } = await searchParams;
  // An unknown value from a hand-edited URL falls back to "all", not an error.
  const kind: KindFilter = (FORM_KINDS as readonly string[]).includes(rawKind ?? "") ? (rawKind as FormKind) : "all";
  const t = await getTranslations("forms");
  const supabase = await createClient();

  const [templates, { data: clients }, features] = await Promise.all([
    new TemplatesService(supabase).listOverview(),
    supabase.from("clients").select("id, display_name").eq("status", "active").order("display_name"),
    getFeatures(),
  ]);
  // Forms that already exist stay usable on any plan, and the first one is
  // free (private.require_forms_builder); more need forms_builder.
  // ponytail: archived forms count in the database but aren't listed here,
  // so a coach who archived their only form sees the button and gets
  // upgrade_required from the action instead.
  const canCreate = features.forms_builder || templates.length === 0;

  return (
    <div className="flex flex-col gap-5 max-md:pb-16">
      <PageTitle title={t("title")} />

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl leading-9 font-semibold">{t("title")}</h1>
          <p className="text-base text-muted-foreground">{t("subtitle")}</p>
        </div>
        {/* Pinned above the bottom nav on mobile (end-20 clears the feedback
            widget), inline from md up. */}
        {canCreate ? (
          <Link
            href="/forms/new"
            className={cn(
              buttonVariants(),
              "max-md:fixed max-md:start-4 max-md:end-20 max-md:bottom-[calc(var(--bottom-nav-h)+0.75rem)] max-md:z-30 max-md:h-13 max-md:text-base max-md:shadow-lg"
            )}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("newTemplate")}
          </Link>
        ) : (
          <UpgradePrompt feature="forms_builder" />
        )}
      </header>

      {templates.length === 0 ? (
        <Card>
          <EmptyState brandMark title={t("list.emptyTitle")} description={t("empty")} />
        </Card>
      ) : (
        <FormsClient
          locale={locale}
          kind={kind}
          forms={templates.map((row) => ({ ...row, name: pickLocale(row, locale) }))}
          clients={clients ?? []}
          canCreate={canCreate}
        />
      )}
    </div>
  );
}
