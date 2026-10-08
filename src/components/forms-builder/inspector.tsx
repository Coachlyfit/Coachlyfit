"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppLocale } from "@/domain/locale";
import type { FormField, VisibleIf } from "@/domain/forms/schema";
import { useBuilderStore } from "./builder-store";

const CHOICE_TYPES = ["select", "multiselect", "radio"];
const RANGE_TYPES = ["number", "scale"];
const VISIBLE_IF_OPS: VisibleIf["op"][] = ["eq", "neq", "gt", "lt", "in"];
// 44px / 16px in the mobile edit sheet: a comfortable touch target, and
// iOS doesn't zoom the page on focus.
const INPUT = "max-lg:h-11 max-lg:text-base";

type Bilingual = { ar: string; en: string };

/** Properties of the selected question; renders nothing when none is
 * selected. Unstyled container -- the builder puts it in a side panel on
 * desktop and a bottom sheet on mobile. */
export function Inspector({ className }: { className?: string } = {}) {
  const t = useTranslations("forms.builder.inspector");
  const tTypes = useTranslations("forms.builder.fieldTypes");
  const locale = useLocale() as AppLocale;
  const uid = useId();
  const fields = useBuilderStore((s) => s.fields);
  const selectedId = useBuilderStore((s) => s.selectedId);
  const updateField = useBuilderStore((s) => s.updateField);

  const field = fields.find((f) => f.id === selectedId);
  if (!field) return null;

  const isSection = field.type === "section";
  const number = fields.filter((f) => f.type !== "section").findIndex((f) => f.id === field.id) + 1;
  const options = field.options ?? [];
  const others = fields.filter((f) => f.id !== field.id && f.type !== "section");

  function patch(p: Partial<FormField>) {
    updateField(field!.id, p);
  }

  function patchOption(index: number, label: Bilingual) {
    patch({ options: options.map((o, i) => (i === index ? { ...o, label } : o)) });
  }

  /** An ar/en pair of inputs writing one `{ ar, en }` value. */
  function pair(value: Bilingual | undefined, onChange: (next: Bilingual) => void, labels: { ar: string; en: string }) {
    const current = value ?? { ar: "", en: "" };
    return (
      <>
        <Input
          dir="rtl"
          aria-label={labels.ar}
          placeholder={t("arabic")}
          value={current.ar}
          onChange={(e) => onChange({ ...current, ar: e.target.value })}
          className={INPUT}
        />
        <Input
          dir="ltr"
          aria-label={labels.en}
          placeholder={t("english")}
          value={current.en}
          onChange={(e) => onChange({ ...current, en: e.target.value })}
          className={INPUT}
        />
      </>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {isSection
            ? tTypes("section")
            : t.rich("questionN", {
                n: formatNumber(number, locale),
                num: (chunks) => <span className="font-mono tabular-nums">{chunks}</span>,
              })}
        </span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{tTypes(field.type)}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-label-ar`}>{t("labelAr")}</Label>
        <Input
          id={`${uid}-label-ar`}
          dir="rtl"
          value={field.label.ar}
          onChange={(e) => patch({ label: { ...field.label, ar: e.target.value } })}
          className={INPUT}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-label-en`}>{t("labelEn")}</Label>
        <Input
          id={`${uid}-label-en`}
          dir="ltr"
          value={field.label.en}
          onChange={(e) => patch({ label: { ...field.label, en: e.target.value } })}
          className={INPUT}
        />
      </div>

      {!isSection && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            {t("help")} <span className="font-normal text-muted-foreground">{t("helpHint")}</span>
          </span>
          {pair(field.help, (help) => patch({ help }), { ar: t("helpAr"), en: t("helpEn") })}
        </div>
      )}

      {CHOICE_TYPES.includes(field.type) && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("options")}</span>
          {options.map((option, i) => (
            <div key={option.value} className="flex items-start gap-1.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {pair(option.label, (label) => patchOption(i, label), {
                  ar: t("optionLabelAr"),
                  en: t("optionLabelEn"),
                })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("removeOption")}
                // A choice question with no options can't be saved.
                disabled={options.length <= 1}
                onClick={() => patch({ options: options.filter((_, idx) => idx !== i) })}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-dashed"
            onClick={() =>
              patch({
                options: [
                  ...options,
                  // The stored value is an id the coach never sees; it must
                  // stay stable once clients have answered with it.
                  { value: `option_${Math.random().toString(36).slice(2, 8)}`, label: { ar: "", en: "" } },
                ],
              })
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("addOption")}
          </Button>
        </div>
      )}

      {field.type === "scale" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground">{t("scaleAt", { value: formatNumber(field.min ?? 1, locale) })}</span>
            {pair(field.minLabel, (minLabel) => patch({ minLabel }), { ar: t("scaleMinAr"), en: t("scaleMinEn") })}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground">{t("scaleAt", { value: formatNumber(field.max ?? 5, locale) })}</span>
            {pair(field.maxLabel, (maxLabel) => patch({ maxLabel }), { ar: t("scaleMaxAr"), en: t("scaleMaxEn") })}
          </div>
        </div>
      )}

      {!isSection && (
        <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border pt-3">
          <Label htmlFor={`${uid}-required`}>{t("required")}</Label>
          <Switch
            id={`${uid}-required`}
            checked={field.required}
            onCheckedChange={(checked) => patch({ required: checked })}
          />
        </div>
      )}

      {!isSection && (
        <details className="border-t border-border pt-3">
          <summary className="cursor-pointer font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            {t("advanced")}
          </summary>
          <div className="flex flex-col gap-3.5 pt-3">
            {RANGE_TYPES.includes(field.type) && (
              <div className="grid grid-cols-3 gap-2">
                {(["min", "max", "step"] as const).map((key) => (
                  <div key={key} className="flex flex-col gap-1">
                    <Label htmlFor={`${uid}-${key}`}>{t(key)}</Label>
                    <Input
                      id={`${uid}-${key}`}
                      type="number"
                      value={field[key] ?? ""}
                      onChange={(e) => patch({ [key]: e.target.value === "" ? undefined : Number(e.target.value) })}
                      className={INPUT}
                    />
                  </div>
                ))}
              </div>
            )}

            {field.type === "number" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-unit`}>{t("unit")}</Label>
                <Input
                  id={`${uid}-unit`}
                  value={field.unit ?? ""}
                  onChange={(e) => patch({ unit: e.target.value })}
                  className={INPUT}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t("visibleIf")}</span>
              <Select
                value={field.visibleIf?.fieldId ?? "__none__"}
                onValueChange={(v) => {
                  if (!v || v === "__none__") {
                    patch({ visibleIf: undefined });
                  } else {
                    patch({
                      visibleIf: { fieldId: v, op: field.visibleIf?.op ?? "eq", value: field.visibleIf?.value ?? "" },
                    });
                  }
                }}
                items={[
                  { value: "__none__", label: t("visibleIfNone") },
                  ...others.map((f) => ({ value: f.id, label: f.label.ar || f.label.en || f.id })),
                ]}
              >
                <SelectTrigger aria-label={t("visibleIf")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("visibleIfNone")}</SelectItem>
                  {others.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label.ar || f.label.en || f.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {field.visibleIf && (
                <>
                  <Select
                    value={field.visibleIf.op}
                    onValueChange={(op) => patch({ visibleIf: { ...field.visibleIf!, op: op as VisibleIf["op"] } })}
                  >
                    <SelectTrigger aria-label={t("visibleIfOp")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VISIBLE_IF_OPS.map((op) => (
                        <SelectItem key={op} value={op}>
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={t("visibleIfValue")}
                    aria-label={t("visibleIfValue")}
                    value={String(field.visibleIf.value ?? "")}
                    onChange={(e) => patch({ visibleIf: { ...field.visibleIf!, value: e.target.value } })}
                    className={INPUT}
                  />
                </>
              )}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
