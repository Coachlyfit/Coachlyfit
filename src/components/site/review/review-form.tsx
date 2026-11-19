"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FIRST_NAME_MAX, REVIEW_BODY_MAX, reviewSchema } from "@/domain/sites/review.schema";
import { LockIcon } from "../icons";
import { ConsentSwitchCard } from "./consent-switch-card";
import { ReviewThanks } from "./review-thanks";
import { StarRating } from "./star-rating";
import { submitReviewAction } from "@/app/[locale]/(sites)/sites/[domain]/review/[token]/actions";

type Field = "rating" | "body" | "firstName";

/** The review form and, once sent, the thank-you screen. Validation (zod)
 * shows an error summary (role=alert, links to each field) plus an inline
 * error under each field. */
export function ReviewForm({
  token,
  coachName,
  initialFirstName,
  expiresLabel,
  preview,
  siteHref,
}: {
  token: string;
  coachName: string;
  initialFirstName: string;
  /** Already formatted, e.g. "3 Dec". */
  expiresLabel: string;
  preview: { before: string | null; after: string | null } | null;
  siteHref: string;
}) {
  const t = useTranslations("clientReview");
  const lang = useLocale() as "ar" | "en";
  const uid = useId();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [firstName, setFirstName] = useState(initialFirstName);
  const [sharePhotos, setSharePhotos] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; shared: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const summary = useRef<HTMLDivElement>(null);

  const id = (f: string) => `${uid}-${f}`;
  const errorKeys = Object.keys(errors) as Field[];

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsed = reviewSchema.safeParse({ rating, body, firstName, sharePhotos });
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        next[field] ??= t(`errors.${issue.message as "rating"}`);
      }
      setErrors(next);
      // Move focus to the summary so a screen-reader user hears what's wrong.
      queueMicrotask(() => summary.current?.focus());
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await submitReviewAction(token, lang, parsed.data);
      if ("error" in res) {
        setFormError(t(`errors.${res.error}`));
        return;
      }
      setDone({ name: res.displayName.split(" ")[0] ?? "", shared: res.sharePhotos });
    });
  }

  if (done) {
    return <ReviewThanks token={token} coachName={coachName} name={done.name} sharePhotos={done.shared} siteHref={siteHref} />;
  }

  return (
    <main className="cs-rv-wrap">
      <form onSubmit={submit} noValidate>
        {(errorKeys.length > 0 || formError) && (
          <div ref={summary} role="alert" tabIndex={-1} className="cs-summary">
            {errorKeys.length > 0 ? (
              <>
                <p>{t("errors.summary")}</p>
                <ul>
                  {errorKeys.map((f) => (
                    <li key={f}>
                      <a href={`#${id(f)}`}>{errors[f]}</a>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{formError}</p>
            )}
          </div>
        )}

        <div className="cs-field" id={id("rating")} tabIndex={-1}>
          <span id={id("rating-label")} className="cs-label">
            {t("rating.label")}
          </span>
          <StarRating
            value={rating}
            onChange={setRating}
            labelledBy={id("rating-label")}
            describedBy={errors.rating ? id("rating-error") : undefined}
            invalid={!!errors.rating}
          />
          {errors.rating && (
            <p id={id("rating-error")} className="cs-error">
              {errors.rating}
            </p>
          )}
        </div>

        <div className="cs-field">
          <label htmlFor={id("body")} className="cs-label">
            {t("text.label")}
          </label>
          <textarea
            id={id("body")}
            className="cs-input"
            value={body}
            maxLength={REVIEW_BODY_MAX + 100}
            placeholder={t("text.placeholder")}
            aria-invalid={!!errors.body}
            aria-describedby={`${id("body-hint")}${errors.body ? ` ${id("body-error")}` : ""}`}
            onChange={(e) => setBody(e.target.value)}
          />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <p id={id("body-hint")} className="cs-hint">
              {t("text.hint")}
            </p>
            <span className="cs-count cs-mono" aria-hidden="true">
              {t("text.counter", { n: body.trim().length, max: REVIEW_BODY_MAX })}
            </span>
          </div>
          {errors.body && (
            <p id={id("body-error")} className="cs-error">
              {errors.body}
            </p>
          )}
        </div>

        <div className="cs-field">
          <label htmlFor={id("firstName")} className="cs-label">
            {t("name.label")}
          </label>
          <input
            id={id("firstName")}
            className="cs-input"
            value={firstName}
            maxLength={FIRST_NAME_MAX}
            autoComplete="given-name"
            aria-invalid={!!errors.firstName}
            aria-describedby={`${id("name-hint")}${errors.firstName ? ` ${id("name-error")}` : ""}`}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <p id={id("name-hint")} className="cs-hint">
            {t("name.hint")}
          </p>
          {errors.firstName && (
            <p id={id("name-error")} className="cs-error">
              {errors.firstName}
            </p>
          )}
        </div>

        <ConsentSwitchCard checked={sharePhotos} onChange={setSharePhotos} coachName={coachName} preview={preview} />

        <div className="cs-field" style={{ gap: 12 }}>
          <p className="cs-trust">
            <LockIcon size={16} />
            <span>{t("trust")}</span>
          </p>
          <button type="submit" className="cs-btn cs-btn--primary cs-btn--lg" disabled={pending} aria-busy={pending}>
            {pending && <span className="cs-spin" aria-hidden="true" />}
            {pending ? t("sending") : t("submit")}
          </button>
          <p className="cs-hint" style={{ textAlign: "center" }}>
            {t("expiry", { date: expiresLabel })}
          </p>
        </div>
      </form>
    </main>
  );
}
