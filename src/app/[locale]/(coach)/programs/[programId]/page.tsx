import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { ProgramsService } from "@/domain/programs/programs.service";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { ProgramBuilder } from "./program-builder";

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; programId: string }>;
}) {
  const { locale, programId } = await params;
  const t = await getTranslations("programs");
  const supabase = await createClient();

  const [tree, { data: clients }] = await Promise.all([
    new ProgramsService(supabase).getTree(programId),
    supabase.from("clients").select("id, display_name").neq("status", "archived"),
  ]);
  if (!tree) notFound();

  const isTemplate = !tree.client_id;

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
        <Link href="/programs" className="text-sm text-muted-foreground hover:text-foreground">
          {t("title")}
        </Link>
      </div>

      <ProgramBuilder
        // Keyed on a signature of every day+item id so a server mutation
        // (add/delete/reorder, via revalidatePath) remounts the client tree
        // with fresh local state instead of syncing props via an effect.
        key={tree.program_days
          .map((d) => `${d.id}:${d.program_items.map((i) => i.id).join(",")}`)
          .join("|")}
        locale={locale}
        tree={tree}
        clients={clients ?? []}
        isTemplate={isTemplate}
      />
    </div>
  );
}
