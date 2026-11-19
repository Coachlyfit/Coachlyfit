"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX, siteDraftSchema, type Lang, type SiteDraft } from "@/domain/sites/site-content";
import { describedBy, Field, useFieldError, useSectionForm } from "./form-kit";

const schema = siteDraftSchema.shape.cta;
type Cta = z.infer<typeof schema>;

export function SectionFormCta({ content, lang, onChange }: { content: SiteDraft; lang: Lang; onChange: (patch: Partial<SiteDraft>) => void }) {
  const t = useTranslations("websiteEditor.form.cta");
  const err = useFieldError();
  const uid = useId();
  const form = useSectionForm<Cta>(schema, content.cta, (cta) => onChange({ cta }));
  const {
    register,
    watch,
    formState: { errors },
  } = form;
  const id = (name: string) => `${uid}-${name}`;
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()} noValidate>
      <Field id={id("title")} label={t("heading")} count={watch(`title.${lang}`).length} max={MAX.ctaTitle} error={err(errors.title?.[lang])}>
        <Input id={id("title")} lang={lang} dir={dir} {...register(`title.${lang}`)} aria-invalid={!!errors.title?.[lang]} aria-describedby={describedBy(id("title"), false, !!errors.title?.[lang])} />
      </Field>
      <Field id={id("text")} label={t("text")} count={watch(`text.${lang}`).length} max={MAX.ctaText} error={err(errors.text?.[lang])}>
        <Textarea id={id("text")} rows={3} lang={lang} dir={dir} {...register(`text.${lang}`)} aria-invalid={!!errors.text?.[lang]} aria-describedby={describedBy(id("text"), false, !!errors.text?.[lang])} />
      </Field>
      <Field id={id("button")} label={t("button")} hint={t("buttonHint")} count={watch(`button.${lang}`).length} max={MAX.button} error={err(errors.button?.[lang])}>
        <Input id={id("button")} lang={lang} dir={dir} {...register(`button.${lang}`)} aria-invalid={!!errors.button?.[lang]} aria-describedby={describedBy(id("button"), true, !!errors.button?.[lang])} />
      </Field>
    </form>
  );
}
