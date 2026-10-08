import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TemplatesService } from "@/domain/forms/templates.service";
import type { FormField } from "@/domain/forms/schema";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { PageTitle } from "@/components/dashboard/page-title";
import { BuilderPageClient } from "./builder-page-client";

export default async function FormBuilderPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; templateId: string }>;
}) {
  const { locale, templateId } = await params;
  const supabase = await createClient();
  const templatesService = new TemplatesService(supabase);

  const template = await templatesService.get(templateId);
  if (!template || template.archived_at) notFound();

  const [currentVersion, { data: clients }] = await Promise.all([
    template.current_version_id ? templatesService.getVersion(template.current_version_id) : null,
    supabase.from("clients").select("id, display_name").eq("status", "active").order("display_name"),
  ]);
  // Unpublished edits (or a new form's starter questions) win over the
  // published version.
  const schema = (template.draft_schema ?? currentVersion?.schema) as { fields?: FormField[] } | null | undefined;

  return (
    <>
      <PageTitle title={pickLocale(template, locale)} />
      <BuilderPageClient
        locale={locale}
        templateId={templateId}
        names={{ name_ar: template.name_ar, name_en: template.name_en }}
        kind={template.kind}
        initialFields={schema?.fields ?? []}
        hasDraft={template.draft_schema != null}
        currentVersionId={template.current_version_id}
        clients={clients ?? []}
      />
    </>
  );
}
