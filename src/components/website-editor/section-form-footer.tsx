"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { siteDraftSchema, type SiteDraft } from "@/domain/sites/site-content";
import { describedBy, Field, useFieldError, useSectionForm } from "./form-kit";

const schema = siteDraftSchema.shape.socials;
type Socials = z.infer<typeof schema>;
const FIELDS = ["instagram", "tiktok", "youtube"] as const;

/** Social links are the same in both languages. */
export function SectionFormFooter({ content, onChange }: { content: SiteDraft; onChange: (patch: Partial<SiteDraft>) => void }) {
  const t = useTranslations("websiteEditor.form.footer");
  const err = useFieldError();
  const uid = useId();
  const form = useSectionForm<Socials>(schema, content.socials, (socials) => onChange({ socials }));
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()} noValidate>
      <h3 className="text-sm font-semibold">{t("social")}</h3>
      {FIELDS.map((name) => {
        const id = `${uid}-${name}`;
        return (
          <Field key={name} id={id} label={t(name)} hint={t("urlHint")} error={err(errors[name], "url")}>
            <Input
              id={id}
              type="url"
              inputMode="url"
              dir="ltr"
              className="font-mono"
              placeholder="https://"
              {...register(name)}
              aria-invalid={!!errors[name]}
              aria-describedby={describedBy(id, true, !!errors[name])}
            />
          </Field>
        );
      })}
    </form>
  );
}
