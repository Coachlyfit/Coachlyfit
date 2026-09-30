"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BodyProfileForm, type BodyProfileValues } from "@/components/nutrition/body-profile-form";
import type { AppLocale } from "@/domain/locale";
import { formatDate, formatNumber } from "@/lib/format";
import { targetsSource, type SuggestResult, type SuggestedTargets } from "@/domain/nutrition/suggest-targets";
import { assignClientTargetsAction, saveClientBodyProfileAction } from "./nutrition-actions";

const MACRO_FIELDS = [
  { key: "kcal", label: "kcal" },
  { key: "protein_g", label: "protein" },
  { key: "carb_g", label: "carbs" },
  { key: "fat_g", label: "fat" },
] as const;

/** Shows the macro suggestion for a client and lets the coach fill in
 * missing body data, tweak any number, and assign the result to the
 * client's active diet plan. Everything shown is computed server-side from
 * stored data (NutritionLogsService.suggestionFor); saving the body
 * profile revalidates the page, which re-renders this with a new result. */
export function SuggestTargetsDialog({
  locale,
  clientId,
  dietPlanId,
  profile,
  weight,
  result,
}: {
  locale: AppLocale;
  clientId: string;
  dietPlanId: string | null;
  profile: BodyProfileValues | null;
  weight: { weight: number; date: string } | null;
  result: SuggestResult;
}) {
  const t = useTranslations("nutrition");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Sparkles className="size-4" />
        {t("suggest.button")}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("suggest.title")}</DialogTitle>
          <DialogDescription>{t("suggest.description")}</DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{t("suggest.clientData")}</h3>
          <p className="text-sm text-muted-foreground">
            {weight
              ? t("suggest.weightFrom", {
                  weight: formatNumber(weight.weight, locale),
                  date: formatDate(weight.date, locale, { timeZone: "UTC" }),
                })
              : t("suggest.noWeight")}
          </p>
          <BodyProfileForm initial={profile} save={(input) => saveClientBodyProfileAction(locale, clientId, input)} />
        </section>

        <Separator />

        {result.ok ? (
          <SuggestionPanel
            // Remount (resetting any edits) whenever a saved profile changes the suggestion.
            key={JSON.stringify(result.targets)}
            locale={locale}
            clientId={clientId}
            dietPlanId={dietPlanId}
            result={result}
            onAssigned={() => setOpen(false)}
          />
        ) : (
          <section className="flex flex-col gap-2 rounded-lg border border-dashed p-3 text-sm">
            <p className="font-medium">{t("suggest.cannotSuggest")}</p>
            {result.missing.length > 0 && (
              <p className="text-muted-foreground">
                {t("suggest.missing", { fields: listFormat(locale, result.missing.map((f) => t(`fields.${f}`))) })}
              </p>
            )}
            {result.invalid.length > 0 && (
              <p className="text-destructive">
                {t("suggest.invalid", { fields: listFormat(locale, result.invalid.map((f) => t(`fields.${f}`))) })}
              </p>
            )}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SuggestionPanel({
  locale,
  clientId,
  dietPlanId,
  result,
  onAssigned,
}: {
  locale: AppLocale;
  clientId: string;
  dietPlanId: string | null;
  result: Extract<SuggestResult, { ok: true }>;
  onAssigned: () => void;
}) {
  const t = useTranslations("nutrition");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<keyof SuggestedTargets, string>>({
    kcal: String(result.targets.kcal),
    protein_g: String(result.targets.protein_g),
    carb_g: String(result.targets.carb_g),
    fat_g: String(result.targets.fat_g),
  });

  const numeric = {
    kcal: Number(values.kcal),
    protein_g: Number(values.protein_g),
    carb_g: Number(values.carb_g),
    fat_g: Number(values.fat_g),
  };
  const source = targetsSource(result.targets, numeric);
  const macroKcal = numeric.protein_g * 4 + numeric.carb_g * 4 + numeric.fat_g * 9;

  function assign() {
    if (!dietPlanId) return;
    startTransition(async () => {
      const res = await assignClientTargetsAction(locale, clientId, dietPlanId, {
        target_kcal: values.kcal,
        target_protein_g: values.protein_g,
        target_carb_g: values.carb_g,
        target_fat_g: values.fat_g,
      });
      if (res?.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      toast.success(t("suggest.assigned"));
      onAssigned();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("suggest.suggestion")}</h3>
        <Badge variant={source === "suggested" ? "secondary" : "outline"}>{t(`suggest.source.${source}`)}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("suggest.formula", {
          bmr: formatNumber(result.bmr, locale),
          tdee: formatNumber(result.tdee, locale),
          age: result.ageYears,
        })}
      </p>
      {result.warnings.map((w) => (
        <p key={w} className="text-xs text-amber-600 dark:text-amber-400">
          {t(`suggest.warnings.${w}`)}
        </p>
      ))}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MACRO_FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5">
            <Label htmlFor={`target-${f.key}`}>{t(`suggest.${f.label}`)}</Label>
            <Input
              id={`target-${f.key}`}
              type="number"
              inputMode="numeric"
              min={0}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {Math.abs(macroKcal - numeric.kcal) > numeric.kcal * 0.1 && (
        <p className="text-xs text-muted-foreground">
          {t("suggest.macroKcalMismatch", { kcal: formatNumber(Math.round(macroKcal), locale) })}
        </p>
      )}

      {!dietPlanId && <p className="text-sm text-muted-foreground">{t("suggest.noPlan")}</p>}
      <Button type="button" onClick={assign} disabled={pending || !dietPlanId}>
        {pending ? tCommon("pending") : t("suggest.assign")}
      </Button>
    </section>
  );
}

function listFormat(locale: AppLocale, items: string[]): string {
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(items);
}
