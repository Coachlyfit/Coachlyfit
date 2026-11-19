"use client";

import { useId } from "react";
import { useFieldArray } from "react-hook-form";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { emptyService, MAX, siteDraftSchema, type Lang, type SiteDraft } from "@/domain/sites/site-content";
import { describedBy, Field, selectClass, useFieldError, useSectionForm } from "./form-kit";

const schema = z.object({ services: siteDraftSchema.shape.services });
type Values = z.infer<typeof schema>;

/** 1–4 services as reorderable cards. Reordering uses up/down buttons: they
 * work by keyboard and screen reader as well as by touch. */
export function SectionFormServices({ content, lang, onChange }: { content: SiteDraft; lang: Lang; onChange: (patch: Partial<SiteDraft>) => void }) {
  const t = useTranslations("websiteEditor.form.services");
  const err = useFieldError();
  const uid = useId();
  const form = useSectionForm<Values>(schema, { services: content.services }, ({ services }) => onChange({ services }));
  const {
    register,
    watch,
    setValue,
    control,
    formState: { errors },
  } = form;
  const { fields, append, remove, move } = useFieldArray({ control, name: "services" });
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()} noValidate>
      {fields.map((field, i) => {
        const base = `${uid}-${field.id}`;
        const e = errors.services?.[i];
        const contact = watch(`services.${i}.contactForPrice`);
        return (
          <fieldset key={field.id} className="flex flex-col gap-3 rounded-xl p-3 ring-1 ring-foreground/10">
            <legend className="px-1 font-mono text-sm font-semibold">{t("item", { n: i + 1 })}</legend>

            <Field id={`${base}-title`} label={t("name")} count={watch(`services.${i}.title.${lang}`).length} max={MAX.serviceTitle} error={err(e?.title?.[lang])}>
              <Input
                id={`${base}-title`}
                lang={lang}
                dir={dir}
                {...register(`services.${i}.title.${lang}`)}
                aria-invalid={!!e?.title?.[lang]}
                aria-describedby={describedBy(`${base}-title`, false, !!e?.title?.[lang])}
              />
            </Field>

            <Field
              id={`${base}-desc`}
              label={t("description")}
              count={watch(`services.${i}.description.${lang}`).length}
              max={MAX.serviceDescription}
              error={err(e?.description?.[lang])}
            >
              <Textarea
                id={`${base}-desc`}
                rows={2}
                lang={lang}
                dir={dir}
                {...register(`services.${i}.description.${lang}`)}
                aria-invalid={!!e?.description?.[lang]}
                aria-describedby={describedBy(`${base}-desc`, false, !!e?.description?.[lang])}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id={`${base}-price`} label={`${t("price")} (${t("currency")})`} error={err(e?.price)}>
                <Input
                  id={`${base}-price`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  dir="ltr"
                  className="font-mono"
                  disabled={contact}
                  {...register(`services.${i}.price`, { setValueAs: (v) => (v === "" || v == null ? null : Number(v)) })}
                  aria-invalid={!!e?.price}
                  aria-describedby={describedBy(`${base}-price`, false, !!e?.price)}
                />
              </Field>
              <Field id={`${base}-unit`} label={t("billed")}>
                <select id={`${base}-unit`} className={selectClass} {...register(`services.${i}.unit`)}>
                  <option value="month">{t("perMonth")}</option>
                  <option value="once">{t("once")}</option>
                </select>
              </Field>
            </div>

            <Label className="min-h-11 cursor-pointer gap-3">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                {...register(`services.${i}.contactForPrice`, {
                  // A contact-for-price service has no price to keep.
                  onChange: (ev) => ev.target.checked && setValue(`services.${i}.price`, null),
                })}
              />
              {t("contactForPrice")}
            </Label>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="icon-sm" className="size-11" aria-label={t("moveUp")} disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="size-11"
                aria-label={t("moveDown")}
                disabled={i === fields.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ms-auto min-h-11 text-destructive"
                disabled={fields.length <= 1}
                onClick={() => remove(i)}
              >
                <Trash2 aria-hidden="true" />
                {t("remove")}
              </Button>
            </div>
          </fieldset>
        );
      })}

      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" className="min-h-11 self-start" disabled={fields.length >= MAX.services} onClick={() => append(emptyService())}>
          <Plus aria-hidden="true" />
          {t("add")}
        </Button>
        <p className="text-sm text-muted-foreground">{t("limit")}</p>
      </div>
    </form>
  );
}
