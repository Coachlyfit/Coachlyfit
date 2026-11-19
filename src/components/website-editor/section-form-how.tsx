"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX, siteContentSchema, type SiteContent } from "@/domain/sites/site-content";
import { describedBy, Field, useFieldError, useSectionForm } from "./form-kit";

const schema = z.object({ how: siteContentSchema.shape.how });
type Values = z.infer<typeof schema>;

/** Three fixed steps: the count can't change, only the words. */
export function SectionFormHow({ content, onChange }: { content: SiteContent; onChange: (patch: Partial<SiteContent>) => void }) {
  const t = useTranslations("websiteEditor.form.how");
  const err = useFieldError();
  const uid = useId();
  const form = useSectionForm<Values>(schema, { how: content.how }, ({ how }) => onChange({ how }));
  const {
    register,
    watch,
    formState: { errors },
  } = form;

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()} noValidate>
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {content.how.map((_, i) => {
        const titleId = `${uid}-t${i}`;
        const textId = `${uid}-x${i}`;
        const e = errors.how?.[i];
        return (
          <fieldset key={i} className="flex flex-col gap-3 rounded-xl p-3 ring-1 ring-foreground/10">
            <legend className="px-1 font-mono text-sm font-semibold">{t("step", { n: i + 1 })}</legend>
            <Field id={titleId} label={t("title")} count={watch(`how.${i}.title`).length} max={MAX.stepTitle} error={err(e?.title)}>
              <Input id={titleId} {...register(`how.${i}.title`)} aria-invalid={!!e?.title} aria-describedby={describedBy(titleId, false, !!e?.title)} />
            </Field>
            <Field id={textId} label={t("text")} count={watch(`how.${i}.text`).length} max={MAX.stepText} error={err(e?.text)}>
              <Textarea id={textId} rows={2} {...register(`how.${i}.text`)} aria-invalid={!!e?.text} aria-describedby={describedBy(textId, false, !!e?.text)} />
            </Field>
          </fieldset>
        );
      })}
    </form>
  );
}
