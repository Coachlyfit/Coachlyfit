"use client";

import { useForm, useWatch, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { pickBilingual, type AppLocale } from "@/domain/locale";
import { buildAnswerSchema, isFieldVisible } from "@/domain/forms/derive";
import type { FormField } from "@/domain/forms/schema";
import type { LibraryRefOption } from "@/domain/forms/library-refs";
import { FieldInput } from "./field-input";
import { ReadonlyAnswer } from "./readonly-answer";

type FormRendererProps = {
  fields: FormField[];
  mode: "preview" | "fill" | "readonly";
  answers?: Record<string, unknown>;
  onSubmit?: (answers: Record<string, unknown>) => Promise<{ error?: string } | void>;
  exerciseOptions?: LibraryRefOption[];
  foodOptions?: LibraryRefOption[];
  uploadContext?: { coachId: string; clientId: string };
};

/** One renderer, three modes — see build plan Phase 5: preview (coach
 * building/checking a template, disabled fieldset, no validation gate),
 * fill (client answering, RHF + buildAnswerSchema), readonly (coach
 * reviewing a stored submission). A field type is taught to render itself
 * once and every mode gets it. */
export function FormRenderer({
  fields,
  mode,
  answers,
  onSubmit,
  exerciseOptions,
  foodOptions,
  uploadContext,
}: FormRendererProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("forms.fill");

  const methods = useForm<Record<string, unknown>>({
    resolver: mode === "fill" ? zodResolver(buildAnswerSchema({ fields })) : undefined,
    defaultValues: mode === "readonly" ? answers : {},
  });
  // useWatch, not methods.watch() — the latter returns a plain function
  // React Compiler can't safely memoize (it can't tell the subscription is
  // reactive), which silently disables memoization for this component.
  const values = useWatch({ control: methods.control });

  if (mode === "readonly") {
    return (
      <div className="flex flex-col gap-4">
        {fields.map((field) => {
          if (!isFieldVisible(field, answers ?? {})) return null;
          if (field.type === "section") {
            return (
              <h3 key={field.id} className="pt-2 text-base font-semibold">
                {pickBilingual(field.label, locale)}
              </h3>
            );
          }
          return (
            <div key={field.id} className="flex flex-col gap-1 border-b border-border pb-3">
              <span className="text-sm font-medium text-muted-foreground">
                {pickBilingual(field.label, locale)}
              </span>
              <ReadonlyAnswer
                field={field}
                value={answers?.[field.id]}
                locale={locale}
                refOptions={field.type === "exercise_ref" ? exerciseOptions : foodOptions}
              />
            </div>
          );
        })}
      </div>
    );
  }

  async function handleValidSubmit(data: Record<string, unknown>) {
    if (!onSubmit) return;
    const result = await onSubmit(data);
    if (result?.error) methods.setError("root", { message: result.error });
  }

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={mode === "fill" ? methods.handleSubmit(handleValidSubmit) : undefined}
        className="flex flex-col gap-6"
      >
        <fieldset disabled={mode === "preview"} className="flex flex-col gap-6">
          {fields.map((field) => {
            if (!isFieldVisible(field, values)) return null;
            if (field.type === "section") {
              return (
                <h3 key={field.id} className="pt-2 text-base font-semibold">
                  {pickBilingual(field.label, locale)}
                </h3>
              );
            }
            const error = methods.formState.errors[field.id];
            return (
              <div key={field.id} className="flex flex-col gap-2">
                <Label htmlFor={field.id}>
                  {pickBilingual(field.label, locale)}
                  {field.required && <span className="text-destructive"> *</span>}
                </Label>
                {field.help && (
                  <p className="text-xs text-muted-foreground">{pickBilingual(field.help, locale)}</p>
                )}
                <FieldInput
                  field={field}
                  refOptions={field.type === "exercise_ref" ? exerciseOptions : foodOptions}
                  uploadContext={uploadContext}
                />
                {error && <p className="text-sm text-destructive">{String(error.message)}</p>}
              </div>
            );
          })}
        </fieldset>
        {mode === "fill" && (
          <Button type="submit" disabled={methods.formState.isSubmitting}>
            {t("submit")}
          </Button>
        )}
      </form>
    </FormProvider>
  );
}
