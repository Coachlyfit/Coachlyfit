"use client";

import { useId } from "react";
import { useFieldArray } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX, siteContentSchema, type SiteContent } from "@/domain/sites/site-content";
import { describedBy, Field, useFieldError, useSectionForm } from "./form-kit";

const schema = z.object({ faq: siteContentSchema.shape.faq });
type Values = z.infer<typeof schema>;

export function SectionFormFaq({ content, onChange }: { content: SiteContent; onChange: (patch: Partial<SiteContent>) => void }) {
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

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()} noValidate>
      {fields.map((field, i) => {
        const qId = `${uid}-q${field.id}`;
        const aId = `${uid}-a${field.id}`;
        const e = errors.faq?.[i];
        return (
          <fieldset key={field.id} className="flex flex-col gap-3 rounded-xl p-3 ring-1 ring-foreground/10">
            <legend className="px-1 font-mono text-sm font-semibold">{t("item", { n: i + 1 })}</legend>
            <Field id={qId} label={t("question")} count={watch(`faq.${i}.q`).length} max={MAX.faqQ} error={err(e?.q)}>
              <Input id={qId} {...register(`faq.${i}.q`)} aria-invalid={!!e?.q} aria-describedby={describedBy(qId, false, !!e?.q)} />
            </Field>
            <Field id={aId} label={t("answer")} count={watch(`faq.${i}.a`).length} max={MAX.faqA} error={err(e?.a)}>
              <Textarea id={aId} rows={3} {...register(`faq.${i}.a`)} aria-invalid={!!e?.a} aria-describedby={describedBy(aId, false, !!e?.a)} />
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
          onClick={() => append({ q: "", a: "" })}
        >
          <Plus aria-hidden="true" />
          {t("add")}
        </Button>
        <p className="text-sm text-muted-foreground">{t("limit")}</p>
      </div>
    </form>
  );
}
