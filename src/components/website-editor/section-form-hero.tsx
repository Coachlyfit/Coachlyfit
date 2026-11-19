"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX, siteDraftSchema, type Lang, type SiteDraft } from "@/domain/sites/site-content";
import { describedBy, Field, selectClass, useFieldError, useSectionForm } from "./form-kit";

const schema = siteDraftSchema.shape.hero;
type Hero = z.infer<typeof schema>;

export function SectionFormHero({
  content,
  lang,
  onChange,
}: {
  content: SiteDraft;
  /** Which language's text this form is editing. */
  lang: Lang;
  onChange: (patch: Partial<SiteDraft>) => void;
}) {
  const t = useTranslations("websiteEditor.form.hero");
  const err = useFieldError();
  const uid = useId();
  const form = useSectionForm<Hero>(schema, content.hero, (hero) => onChange({ hero }));
  const {
    register,
    watch,
    formState: { errors },
  } = form;
  const id = (name: string) => `${uid}-${name}`;
  const rtl = lang === "ar";

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()} noValidate>
      <Field id={id("title")} label={t("title")} count={watch(`title.${lang}`).length} max={MAX.heroTitle} error={err(errors.title?.[lang])}>
        <Input
          id={id("title")}
          lang={lang}
          dir={rtl ? "rtl" : "ltr"}
          {...register(`title.${lang}`)}
          aria-invalid={!!errors.title?.[lang]}
          aria-describedby={describedBy(id("title"), false, !!errors.title?.[lang])}
        />
      </Field>

      <Field id={id("intro")} label={t("intro")} count={watch(`intro.${lang}`).length} max={MAX.heroIntro} error={err(errors.intro?.[lang])}>
        <Textarea
          id={id("intro")}
          rows={3}
          lang={lang}
          dir={rtl ? "rtl" : "ltr"}
          {...register(`intro.${lang}`)}
          aria-invalid={!!errors.intro?.[lang]}
          aria-describedby={describedBy(id("intro"), false, !!errors.intro?.[lang])}
        />
      </Field>

      <Field id={id("main")} label={t("mainButton")}>
        <select id={id("main")} className={selectClass} {...register("mainButton")}>
          <option value="whatsapp">{t("optWhatsapp")}</option>
          <option value="join">{t("optJoin")}</option>
        </select>
      </Field>

      <Field id={id("wa")} label={t("whatsapp")} hint={t("whatsappHint")} error={err(errors.whatsapp, "phone")}>
        <Input
          id={id("wa")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          className="font-mono"
          placeholder="+201001234567"
          {...register("whatsapp")}
          aria-invalid={!!errors.whatsapp}
          aria-describedby={describedBy(id("wa"), true, !!errors.whatsapp)}
        />
      </Field>

      <Field
        id={id("second")}
        label={t("secondary")}
        hint={t("secondaryHint")}
        count={watch(`secondaryLabel.${lang}`).length}
        max={MAX.button}
        error={err(errors.secondaryLabel?.[lang])}
      >
        <Input
          id={id("second")}
          lang={lang}
          dir={rtl ? "rtl" : "ltr"}
          {...register(`secondaryLabel.${lang}`)}
          aria-invalid={!!errors.secondaryLabel?.[lang]}
          aria-describedby={describedBy(id("second"), true, !!errors.secondaryLabel?.[lang])}
        />
      </Field>
    </form>
  );
}
