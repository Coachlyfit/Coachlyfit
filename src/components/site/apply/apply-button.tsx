"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useCallback, useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ACTIVITY_LEVELS, applicationSchema, GOALS } from "@/domain/coaching-applications/schema";
import { submitApplicationAction } from "@/app/[locale]/(sites)/sites/[domain]/apply/actions";
import { CloseIcon } from "../icons";

type Field = "name" | "email" | "phone" | "goal" | "activityLevel" | "source" | "message";
const EMPTY = { name: "", email: "", phone: "", goal: "", activityLevel: "", source: "", message: "" };

/** "Apply for coaching" button plus its form dialog. Base UI Dialog with site
 * styling, portaled into the site root so the coach's theme tokens apply.
 * `siteKey` is the key the public site was opened with (custom domain or
 * slug); the RPC resolves the coach from it. Without one (editor preview) the
 * form can't be sent. */
export function ApplyButton({ siteKey, className, children }: { siteKey?: string; className: string; children?: ReactNode }) {
  const t = useTranslations("site.apply");
  const ta = useTranslations("applications");
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => setRoot(el?.closest<HTMLElement>(".cs-root") ?? null), []);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const id = (f: string) => `${uid}-${f}`;
  const set = (f: Field) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f]: e.target.value }));

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && done) {
      setDone(false);
      setValues(EMPTY);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = applicationSchema.safeParse({
      ...values,
      source: values.source || undefined,
      message: values.message || undefined,
    });
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as Field] ??= t(`errors.${issue.message as "name"}`);
      setErrors(next);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await submitApplicationAction(siteKey ?? "", parsed.data);
      if ("error" in res) setFormError(t(`errors.${res.error}`));
      else setDone(true);
    });
  }

  const err = (f: Field) =>
    errors[f] ? (
      <p id={id(`${f}-error`)} className="cs-error">
        {errors[f]}
      </p>
    ) : null;
  const a11y = (f: Field) => ({ "aria-invalid": !!errors[f], "aria-describedby": errors[f] ? id(`${f}-error`) : undefined });

  return (
    <>
      <button ref={ref} type="button" className={className} onClick={() => setOpen(true)}>
        {children ?? t("button")}
      </button>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal container={root}>
          <Dialog.Backdrop className="cs-veil" />
          <Dialog.Popup className="cs-modal cs-apply">
            <div className="cs-modal-head">
              <Dialog.Title className="cs-label">{t("title")}</Dialog.Title>
              <Dialog.Close className="cs-close" aria-label={t("close")}>
                <CloseIcon />
              </Dialog.Close>
            </div>
            {done ? (
              <div role="status" className="cs-field">
                <p className="cs-label">{t("successTitle")}</p>
                <p className="cs-hint">{t("successBody")}</p>
                <Dialog.Close className="cs-btn cs-btn--primary">{t("close")}</Dialog.Close>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="cs-apply-form">
                <Dialog.Description className="cs-hint">{t("intro")}</Dialog.Description>
                {formError && (
                  <div role="alert" className="cs-summary">
                    {formError}
                  </div>
                )}
                <div className="cs-field">
                  <label htmlFor={id("name")} className="cs-label">
                    {ta("fields.name")}
                  </label>
                  <input id={id("name")} className="cs-input" value={values.name} maxLength={100} autoComplete="name" onChange={set("name")} {...a11y("name")} />
                  {err("name")}
                </div>
                <div className="cs-field">
                  <label htmlFor={id("email")} className="cs-label">
                    {ta("fields.email")}
                  </label>
                  <input id={id("email")} type="email" dir="ltr" className="cs-input" value={values.email} maxLength={200} autoComplete="email" onChange={set("email")} {...a11y("email")} />
                  {err("email")}
                </div>
                <div className="cs-field">
                  <label htmlFor={id("phone")} className="cs-label">
                    {t("phone")}
                  </label>
                  <input id={id("phone")} type="tel" dir="ltr" className="cs-input" value={values.phone} maxLength={30} autoComplete="tel" onChange={set("phone")} {...a11y("phone")} />
                  {err("phone")}
                </div>
                <div className="cs-field">
                  <label htmlFor={id("goal")} className="cs-label">
                    {ta("fields.goal")}
                  </label>
                  <select id={id("goal")} className="cs-input" value={values.goal} onChange={set("goal")} {...a11y("goal")}>
                    <option value="">{t("choose")}</option>
                    {GOALS.map((g) => (
                      <option key={g} value={g}>
                        {ta(`goals.${g}`)}
                      </option>
                    ))}
                  </select>
                  {err("goal")}
                </div>
                <div className="cs-field">
                  <label htmlFor={id("activityLevel")} className="cs-label">
                    {ta("fields.activityLevel")}
                  </label>
                  <select id={id("activityLevel")} className="cs-input" value={values.activityLevel} onChange={set("activityLevel")} {...a11y("activityLevel")}>
                    <option value="">{t("choose")}</option>
                    {ACTIVITY_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {ta(`activity.${l}`)}
                      </option>
                    ))}
                  </select>
                  {err("activityLevel")}
                </div>
                <div className="cs-field">
                  <label htmlFor={id("source")} className="cs-label">
                    {t("source")}
                  </label>
                  <input id={id("source")} className="cs-input" value={values.source} maxLength={200} onChange={set("source")} {...a11y("source")} />
                  {err("source")}
                </div>
                <div className="cs-field">
                  <label htmlFor={id("message")} className="cs-label">
                    {ta("fields.message")}
                  </label>
                  <textarea id={id("message")} className="cs-input" value={values.message} maxLength={2000} onChange={set("message")} {...a11y("message")} />
                  {err("message")}
                </div>
                <button type="submit" className="cs-btn cs-btn--primary cs-btn--lg" disabled={pending} aria-busy={pending}>
                  {pending && <span className="cs-spin" aria-hidden="true" />}
                  {pending ? t("sending") : t("submit")}
                </button>
              </form>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
