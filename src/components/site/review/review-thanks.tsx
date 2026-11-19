"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckCircleIcon, LockIcon } from "../icons";
import { withdrawConsentAction } from "@/app/[locale]/(sites)/sites/[domain]/review/[token]/actions";

/** After sending: thanks, what happens to the photos, and (if they were
 * shared) a Withdraw button that works immediately. */
export function ReviewThanks({
  token,
  coachName,
  name,
  sharePhotos,
  siteHref,
}: {
  token: string;
  coachName: string;
  name: string;
  sharePhotos: boolean;
  siteHref: string;
}) {
  const t = useTranslations("clientReview.thanks");
  const [shared, setShared] = useState(sharePhotos);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function withdraw() {
    setError(false);
    startTransition(async () => {
      const res = await withdrawConsentAction(token);
      if ("error" in res) setError(true);
      else setShared(false);
    });
  }

  return (
    <main className="cs-rv-wrap">
      <div className="cs-field" style={{ alignItems: "flex-start", gap: 16 }}>
        <div className="cs-big-icon">
          <CheckCircleIcon size={32} />
        </div>
        <h1 className="cs-h2" style={{ fontSize: 30 }}>
          {name ? t("title", { name }) : t("titleAnonymous")}
        </h1>
        <p className="cs-lead" style={{ color: "var(--muted)" }}>
          {t("text", { coach: coachName })}
        </p>
      </div>

      {sharePhotos && shared && (
        <div className="cs-rcard cs-rcard--ok">
          <h2>{t("sharedTitle")}</h2>
          <p>{t("sharedText")}</p>
          <button type="button" className="cs-btn cs-btn--outline cs-btn--lg" disabled={pending} onClick={withdraw}>
            {pending && <span className="cs-spin" aria-hidden="true" />}
            {pending ? t("withdrawing") : t("withdraw")}
          </button>
          {error && (
            <p className="cs-error" role="alert">
              {t("withdrawFailed")}
            </p>
          )}
        </div>
      )}

      {sharePhotos && !shared && (
        <div className="cs-rcard" role="status">
          <h2>{t("privateTitle")}</h2>
          <p className="cs-hint">{t("withdrawn")}</p>
        </div>
      )}

      {!sharePhotos && (
        <div className="cs-rcard">
          <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <LockIcon size={18} />
            {t("privateTitle")}
          </h2>
          <p className="cs-hint">{t("privateText")}</p>
        </div>
      )}

      <a href={siteHref} className="cs-btn cs-btn--primary cs-btn--lg">
        {t("visit", { coach: coachName })}
      </a>
    </main>
  );
}
