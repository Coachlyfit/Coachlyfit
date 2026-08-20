import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TemplatesService } from "@/domain/forms/templates.service";
import type { FormField } from "@/domain/forms/schema";
import { BuilderPageClient } from "./builder-page-client";

export default async function FormBuilderPage({
  params,
}: {
  params: Promise<{ locale: string; templateId: string }>;
}) {
  const { locale, templateId } = await params;
  const supabase = await createClient();
  const templatesService = new TemplatesService(supabase);

  const template = await templatesService.get(templateId);
  if (!template) notFound();

  const currentVersion = template.current_version_id
    ? await templatesService.getVersion(template.current_version_id)
    : null;
  const initialFields = ((currentVersion?.schema as { fields?: FormField[] } | null)?.fields ?? []) as FormField[];

  const { data: clients } = await supabase
    .from("clients")
    .select("id, display_name")
    .eq("status", "active")
    .order("display_name");

  return (
    <BuilderPageClient
      locale={locale}
      templateId={templateId}
      templateName={locale === "ar" ? template.name_ar : template.name_en}
      kind={template.kind}
      initialFields={initialFields}
      currentVersionId={template.current_version_id}
      currentVersionNumber={currentVersion?.version ?? null}
      clients={clients ?? []}
    />
  );
}
