"use client";

import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormField, VisibleIf } from "@/domain/forms/schema";
import { useBuilderStore } from "./builder-store";

const CHOICE_TYPES = ["select", "multiselect", "radio"];
const RANGE_TYPES = ["number", "scale"];
const VISIBLE_IF_OPS: VisibleIf["op"][] = ["eq", "neq", "gt", "lt", "in"];

export function Inspector() {
  const t = useTranslations("forms.builder.inspector");
  const fields = useBuilderStore((s) => s.fields);
  const selectedId = useBuilderStore((s) => s.selectedId);
  const updateField = useBuilderStore((s) => s.updateField);

  const field = fields.find((f) => f.id === selectedId);

  if (!field) {
    return (
      <div className="flex w-72 shrink-0 items-center justify-center border-s border-border p-4 text-center text-sm text-muted-foreground">
        {t("empty")}
      </div>
    );
  }

  function patch(p: Partial<FormField>) {
    updateField(field!.id, p);
  }

  function patchOption(index: number, p: Partial<{ value: string; label: { ar: string; en: string } }>) {
    const options = [...(field!.options ?? [])];
    options[index] = { ...options[index], ...p };
    patch({ options });
  }

  return (
    <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-s border-border p-4">
      <div className="flex flex-col gap-2">
        <Label>{t("labelAr")}</Label>
        <Input
          dir="rtl"
          value={field.label.ar}
          onChange={(e) => patch({ label: { ...field.label, ar: e.target.value } })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>{t("labelEn")}</Label>
        <Input
          dir="ltr"
          value={field.label.en}
          onChange={(e) => patch({ label: { ...field.label, en: e.target.value } })}
        />
      </div>

      {field.type !== "section" && (
        <>
          <div className="flex flex-col gap-2">
            <Label>{t("helpAr")}</Label>
            <Input
              dir="rtl"
              value={field.help?.ar ?? ""}
              onChange={(e) => patch({ help: { ar: e.target.value, en: field.help?.en ?? "" } })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("helpEn")}</Label>
            <Input
              dir="ltr"
              value={field.help?.en ?? ""}
              onChange={(e) => patch({ help: { ar: field.help?.ar ?? "", en: e.target.value } })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="required">{t("required")}</Label>
            <Switch
              id="required"
              checked={field.required}
              onCheckedChange={(checked) => patch({ required: checked })}
            />
          </div>
        </>
      )}

      {CHOICE_TYPES.includes(field.type) && (
        <div className="flex flex-col gap-2">
          <Label>{t("options")}</Label>
          {(field.options ?? []).map((option, i) => (
            <div key={i} className="flex flex-col gap-1 rounded-md border border-border p-2">
              <Input
                placeholder={t("optionValue")}
                value={option.value}
                onChange={(e) => patchOption(i, { value: e.target.value })}
              />
              <Input
                dir="rtl"
                placeholder={t("optionLabelAr")}
                value={option.label.ar}
                onChange={(e) => patchOption(i, { label: { ...option.label, ar: e.target.value } })}
              />
              <Input
                dir="ltr"
                placeholder={t("optionLabelEn")}
                value={option.label.en}
                onChange={(e) => patchOption(i, { label: { ...option.label, en: e.target.value } })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-end text-destructive hover:text-destructive"
                onClick={() => patch({ options: (field.options ?? []).filter((_, idx) => idx !== i) })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              patch({
                options: [
                  ...(field.options ?? []),
                  { value: `option_${(field.options?.length ?? 0) + 1}`, label: { ar: "", en: "" } },
                ],
              })
            }
          >
            <Plus className="size-4" />
            {t("addOption")}
          </Button>
        </div>
      )}

      {RANGE_TYPES.includes(field.type) && (
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1">
            <Label>{t("min")}</Label>
            <Input
              type="number"
              value={field.min ?? ""}
              onChange={(e) => patch({ min: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>{t("max")}</Label>
            <Input
              type="number"
              value={field.max ?? ""}
              onChange={(e) => patch({ max: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>{t("step")}</Label>
            <Input
              type="number"
              value={field.step ?? ""}
              onChange={(e) => patch({ step: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </div>
        </div>
      )}

      {field.type === "number" && (
        <div className="flex flex-col gap-2">
          <Label>{t("unit")}</Label>
          <Input value={field.unit ?? ""} onChange={(e) => patch({ unit: e.target.value })} />
        </div>
      )}

      {field.type !== "section" && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Label>{t("visibleIf")}</Label>
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
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("visibleIfNone")}</SelectItem>
              {fields
                .filter((f) => f.id !== field.id && f.type !== "section")
                .map((f) => (
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
                <SelectTrigger>
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
                value={String(field.visibleIf.value ?? "")}
                onChange={(e) => patch({ visibleIf: { ...field.visibleIf!, value: e.target.value } })}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
