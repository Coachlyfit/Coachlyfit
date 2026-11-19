"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useTranslations } from "next-intl";
import { durationParts, signedKg, type ResultView } from "@/domain/sites/public-site";
import { BeforeAfterPair } from "./before-after-pair";
import { CloseIcon, LockIcon } from "./icons";

/** "12 weeks" / "10 days". `{n}` is a plain ICU argument, so it stays in Latin
 * digits in Arabic too. */
export function useDurationLabel() {
  const t = useTranslations("site.results");
  return (days: number) => {
    const { unit, n } = durationParts(days);
    return t(unit, { n });
  };
}

/** Larger before/after pair with its chips and the consent note. Base UI
 * Dialog (the primitive under our shadcn Dialog) with site styling; it
 * portals into the site root so the coach's theme tokens apply. */
export function ResultDialog({
  result,
  container,
  onClose,
}: {
  result: ResultView | null;
  container: HTMLElement | null;
  onClose: () => void;
}) {
  const t = useTranslations("site.results");
  const duration = useDurationLabel();
  const kg = result ? signedKg(result.weightDelta) : null;

  return (
    <Dialog.Root open={result !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className="cs-veil" />
        <Dialog.Popup className="cs-modal">
          <Dialog.Title className="cs-sr">{t("title")}</Dialog.Title>
          {result && (
            <>
              <div className="cs-modal-head">
                <div className="cs-chips">
                  <span className="cs-chip cs-mono">{duration(result.durationDays)}</span>
                  {kg && (
                    <span className="cs-chip">
                      <bdi className="cs-mono" dir="ltr">
                        {kg}
                      </bdi>{" "}
                      {t("kg")}
                    </span>
                  )}
                </div>
                <Dialog.Close className="cs-close" aria-label={t("close")}>
                  <CloseIcon />
                </Dialog.Close>
              </div>
              <BeforeAfterPair beforeUrl={result.beforeUrl} afterUrl={result.afterUrl} dialog />
              <Dialog.Description className="cs-note" style={{ margin: 0 }}>
                <LockIcon size={16} />
                <span>{t("consentLine")}</span>
              </Dialog.Description>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
