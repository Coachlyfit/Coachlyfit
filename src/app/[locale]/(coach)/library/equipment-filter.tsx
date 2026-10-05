"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EQUIPMENT, equipmentKey } from "@/domain/library/taxonomy";

const ALL = "all";

/** Stored equipment is an English seed string ("body weight") or whatever a
 * coach typed. Known values go through next-intl; anything else is shown as
 * typed, since there's nothing to translate it from. */
export function useEquipmentLabel() {
  const t = useTranslations("library.equipment");
  return (value: string | null | undefined) => {
    const key = equipmentKey(value);
    return key ? t(key) : value?.trim() || null;
  };
}

/** Exercises only. Same shape as GroupFilter — `null` means any equipment. */
export function EquipmentFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const t = useTranslations("library.filters");
  const equipmentLabel = useEquipmentLabel();
  const options = EQUIPMENT.map((option) => ({ value: option, label: equipmentLabel(option) ?? option }));

  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v) => onChange(v === ALL ? null : v)}
      // See GroupFilter: base-ui needs the labels on Root to render the value.
      items={[{ value: ALL, label: t("allEquipment") }, ...options]}
    >
      <SelectTrigger aria-label={t("equipment")} className="sm:w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t("allEquipment")}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
