"use client";

import { useTranslations, useLocale } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pickLocale, type AppLocale } from "@/domain/locale";

const NONE = "__none__"; // shadcn Select rejects an empty-string item value, so "clear" needs its own sentinel.

/** Controlled: the portal tab's form holds the value and saves it with the
 * tab's Save button (updateDefaultCheckinTemplateAction). */
export function CheckinTemplatePicker({
  templates,
  value,
  onChange,
}: {
  templates: { id: string; name_ar: string; name_en: string }[];
  value: string | null;
  onChange: (templateId: string | null) => void;
}) {
  const t = useTranslations("settings");
  const locale = useLocale();

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => v !== null && onChange(v === NONE ? null : v)}
      items={[
        { value: NONE, label: t("checkinTemplateNone") },
        ...templates.map((template) => ({
          value: template.id,
          label: pickLocale(template, locale as AppLocale),
        })),
      ]}
    >
      <SelectTrigger
        id="default-checkin-template"
        className="w-full text-base data-[size=default]:h-11 md:text-sm md:data-[size=default]:h-10"
      >
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
