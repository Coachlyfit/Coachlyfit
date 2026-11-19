"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LockIcon } from "../icons";
import { withdrawConsentAction } from "@/app/[locale]/(sites)/sites/[domain]/review/[token]/actions";

type State = "idle" | "done" | "nothing" | "error";

/** Target of the "withdraw" link in the confirmation email. A button, never an
 * automatic action on load: mail scanners open links, and a GET must not
 * change anything. */
export function ReviewWithdraw({ token, coachName, siteHref }: { token: string; coachName: string; siteHref: string }) {
  const t = useTranslations("clientReview");
  const [state, setState] = useState<State>("idle");
  const [pending, startTransition] = useTransition();

  function withdraw() {
    startTransition(async () => {
      const res = await withdrawConsentAction(token);
      if ("error" in res) setState("error");
      else setState(res.withdrawn > 0 ? "done" : "nothing");
    });
  }

  return (
    <main className="cs-rv-wrap">
      <div className="cs-field" style={{ alignItems: "flex-start", gap: 16 }}>
        <div className="cs-big-icon">
          <LockIcon size={28} />
        </div>
        <h1 className="cs-h2" style={{ fontSize: 30 }}>
          {t("withdrawPage.title")}
        </h1>
        <p className="cs-lead" style={{ color: "var(--muted)" }}>
          {t("withdrawPage.text", { coach: coachName })}
        </p>
      </div>

      {state === "idle" || state === "error" ? (
        <div className="cs-field">
          <button type="button" className="cs-btn cs-btn--primary cs-btn--lg" disabled={pending} aria-busy={pending} onClick={withdraw}>
            {pending && <span className="cs-spin" aria-hidden="true" />}
            {pending ? t("thanks.withdrawing") : t("withdrawPage.confirm")}
          </button>
          {state === "error" && (
            <p className="cs-error" role="alert">
              {t("withdrawPage.failed")}
            </p>
          )}
        </div>
      ) : (
        <div className="cs-rcard cs-rcard--ok" role="status">
          <h2>{state === "done" ? t("withdrawPage.done") : t("withdrawPage.nothing")}</h2>
        </div>
      )}

      <a href={siteHref} className="cs-btn cs-btn--outline cs-btn--lg">
        {t("thanks.visit", { coach: coachName })}
      </a>
    </main>
  );
}
