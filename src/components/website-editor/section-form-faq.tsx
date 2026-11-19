"use client";

import { useId } from "react";
import { useFieldArray } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX, siteDraftSchema, type Lang, type SiteDraft } from "@/domain/sites/site-content";
import { describedBy, Field, useFieldError, useSectionForm } from "./form-kit";

const schema = z.object({ faq: siteDraftSchema.shape.faq });
type Values = z.infer<typeof schema>;

/** Questions are shared between the languages (same list, same order); each
 * has its own text per language. */
export function SectionFormFaq({ content, lang, onChange }: { content: SiteDraft; lang: Lang; onChange: (patch: Partial<SiteDraft>) => void }) {
  const t = useTranslations("websiteEditor.form.faq");
  const err = useFieldError();
  const uid = useId();
  const form = useSectionForm<Values>(schema, { faq: content.faq }, ({ faq }) => onChange({ faq }));
  const {
    register,
    watch,
    control,
    formState: { errors },
  } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "faq" });
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()} noValidate>
      {fields.map((field, i) => {
        const qId = `${uid}-q${field.id}`;
        const aId = `${uid}-a${field.id}`;
        const e = errors.faq?.[i];
        return (
          <fieldset key={field.id} className="flex flex-col gap-3 rounded-xl p-3 ring-1 ring-foreground/10">
            <legend className="px-1 font-mono text-sm font-semibold">{t("item", { n: i + 1 })}</legend>
            <Field id={qId} label={t("question")} count={watch(`faq.${i}.q.${lang}`).length} max={MAX.faqQ} error={err(e?.q?.[lang])}>
              <Input id={qId} lang={lang} dir={dir} {...register(`faq.${i}.q.${lang}`)} aria-invalid={!!e?.q?.[lang]} aria-describedby={describedBy(qId, false, !!e?.q?.[lang])} />
            </Field>
            <Field id={aId} label={t("answer")} count={watch(`faq.${i}.a.${lang}`).length} max={MAX.faqA} error={err(e?.a?.[lang])}>
              <Textarea id={aId} rows={3} lang={lang} dir={dir} {...register(`faq.${i}.a.${lang}`)} aria-invalid={!!e?.a?.[lang]} aria-describedby={describedBy(aId, false, !!e?.a?.[lang])} />
            </Field>
            <Button type="button" variant="ghost" size="sm" className="min-h-11 self-start text-destructive" onClick={() => remove(i)}>
              <Trash2 aria-hidden="true" />
              {t("remove")}
            </Button>
          </fieldset>
        );
      })}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 self-start"
          disabled={fields.length >= MAX.faq}
          onClick={() => append({ q: { ar: "", en: "" }, a: { ar: "", en: "" } })}
        >
          <Plus aria-hidden="true" />
          {t("add")}
        </Button>
        <p className="text-sm text-muted-foreground">{t("limit")}</p>
      </div>
    </form>
  );
}
