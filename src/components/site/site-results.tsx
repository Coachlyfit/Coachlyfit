"use client";

import { useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { AppLocale } from "@/domain/locale";
import { signedKg, type ResultView } from "@/domain/sites/public-site";
import { formatNumber } from "@/lib/format";
import { BeforeAfterPair } from "./before-after-pair";
import { LockIcon } from "./icons";
import { ResultDialog, useDurationLabel } from "./result-dialog";
import { Slider } from "./slider";

function ResultMeta({ result }: { result: ResultView }) {
  const t = useTranslations("site.results");
  const duration = useDurationLabel();
  const kg = signedKg(result.weightDelta);
  return (
    <span className="cs-result-meta">
      <span className="cs-dur cs-mono">{duration(result.durationDays)}</span>
      {kg && (
        <span className="cs-kg">
          {/* Isolated so the sign stays on the number in RTL. */}
          <bdi className="cs-mono" dir="ltr">
            {kg}
          </bdi>{" "}
          {t("kg")}
        </span>
      )}
    </span>
  );
}

export function SiteResults({ results }: { results: ResultView[] }) {
  const t = useTranslations("site.results");
  const locale = useLocale() as AppLocale;
  const duration = useDurationLabel();
  const [open, setOpen] = useState<number | null>(null);
  // The dialog portals INTO the site root so it inherits the theme tokens.
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const sectionRef = useCallback((el: HTMLElement | null) => setRoot(el?.closest<HTMLElement>(".cs-root") ?? null), []);

  return (
    <section id="results" ref={sectionRef} className="cs-sec cs-ink cs-results">
      <div className="cs-reveal">
        <h2 className="cs-h2">{t("title")}</h2>
        <p className="cs-sub">{t("sub")}</p>
      </div>

      <Slider label={t("title")} onInk>
        {results.map((r, i) => (
          <button
            key={r.id}
            type="button"
            className="cs-result cs-lift"
            aria-haspopup="dialog"
            aria-label={t("open", {
              n: formatNumber(i + 1, locale),
              duration: duration(r.durationDays),
            })}
            onClick={() => setOpen(i)}
          >
            <BeforeAfterPair beforeUrl={r.beforeUrl} afterUrl={r.afterUrl} />
            <ResultMeta result={r} />
          </button>
        ))}
      </Slider>

      <p className="cs-note">
        <LockIcon size={16} />
        <span>{t("consentLine")}</span>
      </p>

      <ResultDialog
        result={open === null ? null : results[open]}
        container={root}
        onClose={() => setOpen(null)}
      />
    </section>
  );
}
