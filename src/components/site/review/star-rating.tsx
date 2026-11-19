"use client";

import { useRef, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { StarIcon } from "../icons";

/** Five 52px stars as a radiogroup. One tab stop; arrow keys move and select
 * (Up/Down always, Left/Right in the reading direction). A word label under
 * the stars says what the choice means. */
export function StarRating({
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
}: {
  value: number;
  onChange: (value: number) => void;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  const t = useTranslations("clientReview.rating");
  const rtl = useLocale() === "ar";
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, current: number) {
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    let next = current;
    if (e.key === forward || e.key === "ArrowDown") next = Math.min(5, current + 1);
    else if (e.key === back || e.key === "ArrowUp") next = Math.max(1, current - 1);
    else return;
    e.preventDefault();
    onChange(next);
    refs.current[next - 1]?.focus();
  }

  // Nothing chosen yet: the first star is the tab stop.
  const tabStop = value || 1;

  return (
    <div className="cs-field">
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className="cs-stars-input"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            ref={(el) => {
              refs.current[n - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={t("star", { n })}
            tabIndex={n === tabStop ? 0 : -1}
            className="cs-star"
            onClick={() => onChange(n)}
            onKeyDown={(e) => onKeyDown(e, n)}
          >
            <StarIcon filled={n <= value} size={40} />
          </button>
        ))}
      </div>
      <p className="cs-star-word" aria-live="polite">
        {value ? t(`words.${value as 1 | 2 | 3 | 4 | 5}`) : ""}
      </p>
    </div>
  );
}
