"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX, siteDraftSchema, type Lang, type SiteDraft } from "@/domain/sites/site-content";
import { describedBy, Field, useFieldError, useSectionForm } from "./form-kit";
import { PhotoField } from "./photo-field";

const schema = siteDraftSchema.shape.about;
type About = z.infer<typeof schema>;

const toNumberOrNull = (v: unknown) => (v === "" || v == null ? null : Number(v));

export function SectionFormAbout({
  content,
  lang,
  coachId,
  onChange,
}: {
  content: SiteDraft;
  lang: Lang;
  coachId: string;
  onChange: (patch: Partial<SiteDraft>) => void;
}) {
  const t = useTranslations("websiteEditor.form.about");
  const err = useFieldError();
  const uid = useId();
  const [newCert, setNewCert] = useState("");
  const form = useSectionForm<About>(schema, content.about, (about) => onChange({ about }));
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const id = (name: string) => `${uid}-${name}`;
  const certs = watch(`certs.${lang}`);
  const dir = lang === "ar" ? "rtl" : "ltr";

  function addCert() {
    const value = newCert.trim().slice(0, MAX.cert);
    if (!value || certs.includes(value) || certs.length >= MAX.certs) return;
    setValue(`certs.${lang}`, [...certs, value], { shouldDirty: true });
    setNewCert("");
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()} noValidate>
      <PhotoField
        coachId={coachId}
        path={watch("photoPath")}
        onChange={(path) => setValue("photoPath", path, { shouldDirty: true })}
      />

      <Field id={id("bio")} label={t("bio")} count={watch(`bio.${lang}`).length} max={MAX.bio} error={err(errors.bio?.[lang])}>
        <Textarea id={id("bio")} rows={5} lang={lang} dir={dir} {...register(`bio.${lang}`)} aria-invalid={!!errors.bio?.[lang]} aria-describedby={describedBy(id("bio"), false, !!errors.bio?.[lang])} />
      </Field>

      <div className="flex flex-col gap-2">
        <label htmlFor={id("cert")} className="text-sm font-medium">
          {t("certs")}
        </label>
        {certs.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {certs.map((cert) => (
              <li key={cert} className="inline-flex items-center gap-1 rounded-md ps-2.5 text-sm ring-1 ring-foreground/20">
                {cert}
                <button
                  type="button"
                  aria-label={t("removeCert", { name: cert })}
                  onClick={() =>
                    setValue(
                      `certs.${lang}`,
                      certs.filter((c) => c !== cert),
                      { shouldDirty: true }
                    )
                  }
                  className="flex size-11 items-center justify-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            id={id("cert")}
            value={newCert}
            lang={lang}
            dir={dir}
            maxLength={MAX.cert}
            placeholder={t("certPlaceholder")}
            disabled={certs.length >= MAX.certs}
            onChange={(e) => setNewCert(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCert();
              }
            }}
          />
          <Button type="button" variant="outline" className="min-h-11 shrink-0" disabled={!newCert.trim() || certs.length >= MAX.certs} onClick={addCert}>
            <Plus aria-hidden="true" />
            {t("addCert")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field id={id("years")} label={t("years")} error={err(errors.years)}>
          <Input
            id={id("years")}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            dir="ltr"
            className="font-mono"
            {...register("years", { setValueAs: toNumberOrNull })}
            aria-invalid={!!errors.years}
            aria-describedby={describedBy(id("years"), false, !!errors.years) ?? id("nums")}
          />
        </Field>
        <Field id={id("clients")} label={t("clients")} error={err(errors.clients)}>
          <Input
            id={id("clients")}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            dir="ltr"
            className="font-mono"
            {...register("clients", { setValueAs: toNumberOrNull })}
            aria-invalid={!!errors.clients}
            aria-describedby={describedBy(id("clients"), false, !!errors.clients) ?? id("nums")}
          />
        </Field>
      </div>
      <p id={id("nums")} className="-mt-2 text-sm text-muted-foreground">
        {t("realNumbers")}
      </p>
    </form>
  );
}
