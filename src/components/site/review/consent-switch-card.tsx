"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { BeforeAfterPair } from "../before-after-pair";

/** "Share my before/after photos": off by default. A plain explanation says
 * photos stay private when it's off and that consent can be withdrawn. When
 * it's on and the coach linked a card, the thumbnail pair shows what would be
 * published. */
export function ConsentSwitchCard({
  checked,
  onChange,
  coachName,
  preview,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  coachName: string;
  preview: { before: string | null; after: string | null } | null;
}) {
  const t = useTranslations("clientReview.consent");
  const id = useId();

  return (
    <div className="cs-consent">
      <div className="cs-consent-row">
        <div className="cs-field">
          <span id={`${id}-label`} className="cs-label">
            {t("label")}
          </span>
          <p id={`${id}-desc`} className="cs-hint">
            {t("text", { coach: coachName })}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-desc ${id}-withdraw`}
          className="cs-switch"
          onClick={() => onChange(!checked)}
        >
          <i />
        </button>
      </div>
      <p id={`${id}-withdraw`} className="cs-hint">
        {t("withdraw")}
      </p>
      {checked && preview && (preview.before || preview.after) && (
        <div className="cs-field">
          <span className="cs-hint">{t("card")}</span>
          <BeforeAfterPair beforeUrl={preview.before} afterUrl={preview.after} />
        </div>
      )}
    </div>
  );
}
