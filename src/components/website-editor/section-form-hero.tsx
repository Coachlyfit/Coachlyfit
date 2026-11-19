"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX, siteContentSchema, type SiteContent } from "@/domain/sites/site-content";
import { describedBy, Field, selectClass, useFieldError, useSectionForm } from "./form-kit";

const schema = siteContentSchema.shape.hero;
type Hero = z.infer<typeof schema>;

export function SectionFormHero({ content, onChange }: { content: SiteContent; onChange: (patch: Partial<SiteContent>) => void }) {
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

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()} noValidate>
      <Field id={id("title")} label={t("title")} count={watch("title").length} max={MAX.heroTitle} error={err(errors.title)}>
        <Input
          id={id("title")}
          {...register("title")}
          aria-invalid={!!errors.title}
          aria-describedby={describedBy(id("title"), false, !!errors.title)}
        />
      </Field>

      <Field id={id("intro")} label={t("intro")} count={watch("intro").length} max={MAX.heroIntro} error={err(errors.intro)}>
        <Textarea
          id={id("intro")}
          rows={3}
          {...register("intro")}
          aria-invalid={!!errors.intro}
          aria-describedby={describedBy(id("intro"), false, !!errors.intro)}
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

      <Field id={id("second")} label={t("secondary")} hint={t("secondaryHint")} count={watch("secondaryLabel").length} max={MAX.button} error={err(errors.secondaryLabel)}>
        <Input
          id={id("second")}
          {...register("secondaryLabel")}
          aria-invalid={!!errors.secondaryLabel}
          aria-describedby={describedBy(id("second"), true, !!errors.secondaryLabel)}
        />
      </Field>
    </form>
  );
}
