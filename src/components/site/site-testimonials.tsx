import { useTranslations } from "next-intl";
import { initialOf } from "@/domain/sites/display-name";
import type { ReviewView } from "@/domain/sites/public-site";
import { CheckCircleIcon, LockIcon, StarIcon } from "./icons";
import { Slider } from "./slider";

// White text on each clears 4.5:1.
const AVATARS = ["#0F766E", "#1D4ED8", "#7C3AED", "#BE185D", "#B45309"];

function avatarFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

function Review({ review }: { review: ReviewView }) {
  const t = useTranslations("site.reviews");
  return (
    <figure className="cs-review cs-card cs-lift">
      <figcaption style={{ display: "contents" }}>
        <header>
          <span className="cs-avatar" aria-hidden="true" style={{ background: avatarFor(review.id) }}>
            {initialOf(review.name)}
          </span>
          <span className="cs-who">
            <b>{review.name}</b>
            <span className="cs-ok">
              <CheckCircleIcon size={14} />
              {t("verified")}
            </span>
          </span>
        </header>
      </figcaption>
      <div className="cs-stars" role="img" aria-label={t("stars", { n: review.rating })}>
        {[1, 2, 3, 4, 5].map((k) => (
          <StarIcon key={k} filled={k <= review.rating} />
        ))}
      </div>
      <blockquote className="cs-quote">{review.text}</blockquote>
    </figure>
  );
}

/** Autoplays (every 6s) on narrow screens, unless reduced motion is set. The
 * reviews are the clients' own words: nothing here edits them. */
export function SiteTestimonials({ reviews }: { reviews: ReviewView[] }) {
  const t = useTranslations("site.reviews");
  return (
    <section id="reviews" className="cs-sec">
      <div className="cs-reveal">
        <h2 className="cs-h2">{t("title")}</h2>
        <p className="cs-sub">{t("sub")}</p>
      </div>
      <Slider label={t("title")} autoplay trackClassName="cs-track--reviews">
        {reviews.map((r) => (
          <Review key={r.id} review={r} />
        ))}
      </Slider>
      <p className="cs-note">
        <LockIcon size={16} />
        <span>{t("note")}</span>
      </p>
    </section>
  );
}
