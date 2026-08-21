"use client";

import { useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateDefaultCheckinTemplateAction } from "@/app/[locale]/(coach)/settings/actions";
import { pickLocale, type AppLocale } from "@/domain/locale";

const NONE = "__none__"; // shadcn Select rejects an empty-string item value, so "clear" needs its own sentinel.

export function CheckinTemplatePicker({
  templates,
  defaultTemplateId,
}: {
  templates: { id: string; name_ar: string; name_en: string }[];
  defaultTemplateId: string | null;
}) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  function onChange(value: string | null) {
    if (value === null) return;
    startTransition(async () => {
      const result = await updateDefaultCheckinTemplateAction(locale, value === NONE ? null : value);
      if (result?.error) {
        toast.error(t("checkinTemplateError"));
        return;
      }
      toast.success(t("checkinTemplateSaved"));
    });
  }

  return (
    <Select
      value={defaultTemplateId ?? NONE}
      onValueChange={onChange}
      disabled={pending}
      items={[
        { value: NONE, label: t("checkinTemplateNone") },
        ...templates.map((template) => ({
          value: template.id,
          label: pickLocale(template, locale as AppLocale),
        })),
      ]}
    >
      <SelectTrigger id="default-checkin-template" className="w-full">
        <SelectValue placeholder={t("checkinTemplateNone")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t("checkinTemplateNone")}</SelectItem>
        {templates.map((template) => (
          <SelectItem key={template.id} value={template.id}>
            {pickLocale(template, locale as AppLocale)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
