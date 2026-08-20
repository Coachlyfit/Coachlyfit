"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Builder } from "@/components/forms-builder/builder";
import type { FormField } from "@/domain/forms/schema";
import { publishTemplateAction } from "../actions";
import { AssignDialog } from "./assign-dialog";

export function BuilderPageClient({
  locale,
  templateId,
  templateName,
  kind,
  initialFields,
  currentVersionId,
  currentVersionNumber,
  clients,
}: {
  locale: string;
  templateId: string;
  templateName: string;
  kind: string;
  initialFields: FormField[];
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  clients: { id: string; display_name: string }[];
}) {
  const tKinds = useTranslations("forms.kinds");
  const t = useTranslations("forms.builder");

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{templateName}</h1>
          <Badge variant="secondary">{tKinds(kind)}</Badge>
          {currentVersionNumber && (
            <span className="text-xs text-muted-foreground">
              {t("publishedAt", { version: currentVersionNumber })}
            </span>
          )}
        </div>
        <AssignDialog locale={locale} templateVersionId={currentVersionId} clients={clients} />
      </div>
      <Builder
        templateId={templateId}
        initialFields={initialFields}
        onPublish={(fields) => publishTemplateAction(locale, templateId, fields)}
      />
    </div>
  );
}
