"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { equipmentKey } from "@/domain/library/taxonomy";
import { PLAN_EQUIPMENT, PLAN_GOALS, PLAN_LEVELS, PLAN_TYPES } from "@/domain/programs/plan-meta";

export type PlanMetaValue = {
  plan_type: string;
  goal: string;
  level: string;
  equipment: string[];
};

export const EMPTY_PLAN_META: PlanMetaValue = { plan_type: "", goal: "", level: "", equipment: [] };

const NONE = "__none__";

/** Appends plan metadata to a FormData the way the server actions read it
 * (planMetaFromForm in actions.ts): selects as plain strings, equipment as a
 * repeated field. */
export function appendPlanMeta(formData: FormData, meta: PlanMetaValue) {
  formData.set("plan_type", meta.plan_type);
  formData.set("goal", meta.goal);
  formData.set("level", meta.level);
  for (const e of meta.equipment) formData.append("equipment", e);
}

function MetaSelect({
  id,
  label,
  value,
  onChange,
  options,
  noneLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  noneLabel: string;
}) {
  const items = [{ value: NONE, label: noneLabel }, ...options];
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : (v ?? ""))} items={items}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Plan type / goal / level selects + equipment chips. Controlled by the
 * parent dialog (not part of its RHF schema) — the server action re-validates
 * every value against the same lists. */
export function PlanMetaFields({
  value,
  onChange,
}: {
  value: PlanMetaValue;
  onChange: (next: PlanMetaValue) => void;
}) {
  const t = useTranslations("programs.planMeta");
  const tTypes = useTranslations("programs.planTypes");
  const tGoals = useTranslations("programs.goals");
  const tLevels = useTranslations("programs.levels");
  const tEquipment = useTranslations("library.equipment");

  const toggle = (e: string) =>
    onChange({
      ...value,
      equipment: value.equipment.includes(e) ? value.equipment.filter((x) => x !== e) : [...value.equipment, e],
    });

  return (
    <div className="flex flex-col gap-4">
      <MetaSelect
        id="plan_type"
        label={t("planType")}
        value={value.plan_type}
        onChange={(v) => onChange({ ...value, plan_type: v })}
        options={PLAN_TYPES.map((p) => ({ value: p, label: tTypes(p) }))}
        noneLabel={t("notSet")}
      />
      <div className="grid grid-cols-2 gap-4">
        <MetaSelect
          id="plan_goal"
          label={t("goal")}
          value={value.goal}
          onChange={(v) => onChange({ ...value, goal: v })}
          options={PLAN_GOALS.map((g) => ({ value: g, label: tGoals(g) }))}
          noneLabel={t("notSet")}
        />
        <MetaSelect
          id="plan_level"
          label={t("level")}
          value={value.level}
          onChange={(v) => onChange({ ...value, level: v })}
          options={PLAN_LEVELS.map((l) => ({ value: l, label: tLevels(l) }))}
          noneLabel={t("notSet")}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>{t("equipment")}</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("equipment")}>
          {PLAN_EQUIPMENT.map((e) => {
            const on = value.equipment.includes(e);
            const key = equipmentKey(e);
            return (
              <Button
                key={e}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                aria-pressed={on}
                onClick={() => toggle(e)}
              >
                {key ? tEquipment(key) : e}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
