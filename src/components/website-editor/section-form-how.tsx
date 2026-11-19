"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX, siteDraftSchema, type Lang, type SiteDraft } from "@/domain/sites/site-content";
import { describedBy, Field, useFieldError, useSectionForm } from "./form-kit";

const schema = z.object({ how: siteDraftSchema.shape.how });
type Values = z.infer<typeof schema>;

/** Three fixed steps: the count can't change, only the words. */
export function SectionFormHow({ content, lang, onChange }: { content: SiteDraft; lang: Lang; onChange: (patch: Partial<SiteDraft>) => void }) {
  const t = useTranslations("websiteEditor.form.how");
  const err = useFieldError();
  const uid = useId();
  const form = useSectionForm<Values>(schema, { how: content.how }, ({ how }) => onChange({ how }));
  const {
    register,
    watch,
    formState: { errors },
  } = form;
  const dir = lang === "ar" ? "rtl" : "ltr";

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
            <Field id={titleId} label={t("title")} count={watch(`how.${i}.title.${lang}`).length} max={MAX.stepTitle} error={err(e?.title?.[lang])}>
              <Input id={titleId} lang={lang} dir={dir} {...register(`how.${i}.title.${lang}`)} aria-invalid={!!e?.title?.[lang]} aria-describedby={describedBy(titleId, false, !!e?.title?.[lang])} />
            </Field>
            <Field id={textId} label={t("text")} count={watch(`how.${i}.text.${lang}`).length} max={MAX.stepText} error={err(e?.text?.[lang])}>
              <Textarea id={textId} rows={2} lang={lang} dir={dir} {...register(`how.${i}.text.${lang}`)} aria-invalid={!!e?.text?.[lang]} aria-describedby={describedBy(textId, false, !!e?.text?.[lang])} />
            </Field>
          </fieldset>
        );
      })}
    </form>
  );
}
