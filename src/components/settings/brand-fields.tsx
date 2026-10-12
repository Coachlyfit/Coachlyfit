"use client";

import { Controller, type UseFormReturn } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Lock, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { BrandFormInput } from "@/app/[locale]/(coach)/settings/brand-schema";

// What each slot falls back to when left empty -- the stock palette.
const DEFAULTS = {
  brand_primary: "#c2410c",
  brand_accent: "#c2410c",
  brand_sidebar: "#0f172a",
  brand_sidebar_text: "#e2e8f0",
} as const;
const FIELDS = ["brand_primary", "brand_accent", "brand_sidebar", "brand_sidebar_text"] as const;
const PRESETS = ["#c2410c", "#2563eb", "#0d9488", "#7c3aed", "#db2777", "#0f766e", "#b45309", "#334155"];

/** Brand tab: primary + accent pickers. The logo itself is the identity
 * tab's invoice logo, so this only links there. */
export function BrandFields({ form, enabled }: { form: UseFormReturn<BrandFormInput>; enabled: boolean }) {
  const t = useTranslations("settings.brand");

  if (!enabled) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl bg-muted/60 p-4">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent-tint text-accent-tint-foreground">
          <Lock className="size-4" aria-hidden="true" />
        </span>
        <p className="font-semibold">{t("locked.title")}</p>
        <p className="text-sm text-muted-foreground">{t("locked.description")}</p>
        <Link href="/settings/subscription" className={buttonVariants({ size: "sm", className: "h-11 md:h-10" })}>
          {t("locked.cta")}
        </Link>
      </div>
    );
  }

  return (
    <>
      {FIELDS.map((name) => (
        <Controller
          key={name}
          control={form.control}
          name={name}
          render={({ field, fieldState }) => {
            const id = `brand_${name}`;
            const effective = field.value || DEFAULTS[name];
            return (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={id}>{t(`${name}.label`)}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t(`${name}.label`)}
                    value={effective}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="size-11 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1 md:size-10"
                  />
                  <Input
                    id={id}
                    dir="ltr"
                    className="h-11 font-mono md:h-10"
                    placeholder={DEFAULTS[name]}
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={!!fieldState.error}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("presets")}>
                  {PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      aria-pressed={effective === color}
                      onClick={() => field.onChange(color)}
                      className={cn(
                        "size-7 rounded-full ring-1 ring-foreground/10 ring-offset-2 ring-offset-card",
                        effective === color && "ring-2 ring-foreground"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <p className={cn("text-xs", fieldState.error ? "text-destructive" : "text-muted-foreground")}>
                  {fieldState.error ? t("invalidColor") : t(`${name}.hint`)}
                </p>
              </div>
            );
          }}
        />
      ))}

      <p className="text-xs text-muted-foreground">{t("contrastNote")}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/settings?tab=identity" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          {t("logoLink")}
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 md:h-10"
          onClick={() => {
            for (const name of FIELDS) form.setValue(name, "", { shouldDirty: true });
          }}
        >
          <RotateCcw className="size-4" />
          {t("reset")}
        </Button>
      </div>
    </>
  );
}
