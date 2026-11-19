import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ReviewExpired } from "@/components/site/review/review-expired";
import { ReviewForm } from "@/components/site/review/review-form";
import { ReviewFooter, ReviewHeader } from "@/components/site/review/review-header";
import { SiteThemeProvider } from "@/components/site/site-theme-provider";
import { routing } from "@/i18n/routing";
import { formatDate } from "@/lib/format";
import { loadReviewPage, newLinkHref } from "@/lib/sites/review-page";

// A personal, single-use link: never cached, never indexed.
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; domain: string; token: string }>;

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer", // the token is in the URL
};

export default async function ReviewPage({ params }: { params: Params }) {
  const { locale, domain, token } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const data = await loadReviewPage(domain, token);
  if (!data) notFound();

  const t = await getTranslations({ locale, namespace: "clientReview" });
  const { request, coachName } = data;
  const siteHref = locale === "en" ? "/?lang=en" : "/";
  const open = request.state === "open";

  return (
    <SiteThemeProvider locale={locale} colors={data.colors}>
      <div className="cs-rv-page">
        <ReviewHeader
          coachName={coachName}
          logoUrl={data.logoUrl}
          title={open ? t("title", { coach: coachName }) : undefined}
          subtitle={open ? t("subtitle") : undefined}
        />
        {open ? (
          <ReviewForm
            token={token}
            coachName={coachName}
            initialFirstName={request.firstName}
            expiresLabel={request.expiresAt ? formatDate(request.expiresAt, locale, { day: "numeric", month: "short" }) : ""}
            preview={request.preview}
            siteHref={siteHref}
          />
        ) : (
          <ReviewExpired
            coachName={coachName}
            whatsappHref={newLinkHref(data.whatsapp, t("expired.askNewText", { coach: coachName }))}
            siteHref={siteHref}
          />
        )}
        <ReviewFooter />
      </div>
    </SiteThemeProvider>
  );
}
