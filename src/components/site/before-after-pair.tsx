import { useTranslations } from "next-intl";
import { Silhouette } from "./silhouette";

/** A framed before / after pair. A null URL draws the silhouette placeholder
 * (sample and preview data). The images are decorative: the visible Before /
 * After tags and the surrounding button label carry the meaning. */
export function BeforeAfterPair({
  beforeUrl,
  afterUrl,
  dialog = false,
}: {
  beforeUrl: string | null;
  afterUrl: string | null;
  dialog?: boolean;
}) {
  const t = useTranslations("site.results");
  return (
    <div className={dialog ? "cs-pair cs-pair--dialog" : "cs-pair"}>
      <div className="cs-cell">
        {beforeUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote Supabase URL, no next/image config
          <img src={beforeUrl} alt="" loading="lazy" />
        ) : (
          <Silhouette />
        )}
        <span className="cs-tag">{t("before")}</span>
      </div>
      <div className="cs-cell">
        {afterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote Supabase URL, no next/image config
          <img src={afterUrl} alt="" loading="lazy" />
        ) : (
          <Silhouette />
        )}
        <span className="cs-tag">{t("after")}</span>
      </div>
    </div>
  );
}
