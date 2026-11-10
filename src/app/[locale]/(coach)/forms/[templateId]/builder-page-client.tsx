"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { Builder } from "@/components/forms-builder/builder";
import type { AppLocale } from "@/domain/locale";
import type { FormField } from "@/domain/forms/schema";
import { publishTemplateAction, renameTemplateAction, saveDraftAction } from "../actions";
import { AssignDialog } from "../assign-dialog";
import { kindMeta } from "@/components/forms-runtime/kind-meta";

/** Wires the route's server actions and assign dialog into the builder,
 * which lives in components/ and knows about neither. */
export function BuilderPageClient({
  locale,
  templateId,
  names,
  kind,
  initialFields,
  hasDraft,
  currentVersionId,
  clients,
}: {
  locale: AppLocale;
  templateId: string;
  names: { name_ar: string; name_en: string };
  kind: string;
  initialFields: FormField[];
  hasDraft: boolean;
  currentVersionId: string | null;
  clients: { id: string; display_name: string }[];
}) {
  const tKinds = useTranslations("forms.kinds");
  // Stable identities: the builder's autosave effect depends on onSaveDraft.
  const onSaveDraft = useCallback((fields: FormField[]) => saveDraftAction(templateId, fields), [templateId]);
  const onPublish = useCallback(
    (fields: FormField[]) => publishTemplateAction(locale, templateId, fields),
    [locale, templateId]
  );
  const onRename = useCallback(
    (next: { name_ar: string; name_en: string }) => renameTemplateAction(locale, templateId, next),
    [locale, templateId]
  );

  return (
    <Builder
      locale={locale}
      templateId={templateId}
      initialFields={initialFields}
      initialNames={names}
      kindLabel={tKinds(kind)}
      kindTint={kindMeta(kind).tint}
      published={currentVersionId != null}
      initialHasDraft={hasDraft}
      // Assigns the published version, not the draft on screen.
      assign={<AssignDialog locale={locale} templateVersionId={currentVersionId} clients={clients} />}
      onPublish={onPublish}
      onSaveDraft={onSaveDraft}
      onRename={onRename}
    />
  );
}
