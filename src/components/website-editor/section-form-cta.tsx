"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX, siteContentSchema, type SiteContent } from "@/domain/sites/site-content";
import { describedBy, Field, useFieldError, useSectionForm } from "./form-kit";

const schema = siteContentSchema.shape.cta;
type Cta = z.infer<typeof schema>;

export function SectionFormCta({ content, onChange }: { content: SiteContent; onChange: (patch: Partial<SiteContent>) => void }) {
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

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()} noValidate>
      <Field id={id("title")} label={t("heading")} count={watch("title").length} max={MAX.ctaTitle} error={err(errors.title)}>
        <Input id={id("title")} {...register("title")} aria-invalid={!!errors.title} aria-describedby={describedBy(id("title"), false, !!errors.title)} />
      </Field>
      <Field id={id("text")} label={t("text")} count={watch("text").length} max={MAX.ctaText} error={err(errors.text)}>
        <Textarea id={id("text")} rows={3} {...register("text")} aria-invalid={!!errors.text} aria-describedby={describedBy(id("text"), false, !!errors.text)} />
      </Field>
      <Field id={id("button")} label={t("button")} hint={t("buttonHint")} count={watch("button").length} max={MAX.button} error={err(errors.button)}>
        <Input id={id("button")} {...register("button")} aria-invalid={!!errors.button} aria-describedby={describedBy(id("button"), true, !!errors.button)} />
      </Field>
    </form>
  );
}
