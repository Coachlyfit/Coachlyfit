import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ReviewExpired } from "@/components/site/review/review-expired";
import { ReviewFooter, ReviewHeader } from "@/components/site/review/review-header";
import { ReviewWithdraw } from "@/components/site/review/review-withdraw";
import { SiteThemeProvider } from "@/components/site/site-theme-provider";
import { routing } from "@/i18n/routing";
import { loadReviewPage, newLinkHref } from "@/lib/sites/review-page";

// Where the "withdraw my photo consent" link in the confirmation email lands.
// Works for a used or expired review link (withdrawal never expires).
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; domain: string; token: string }>;

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function WithdrawPage({ params }: { params: Params }) {
  const { locale, domain, token } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const data = await loadReviewPage(domain, token);
  if (!data) notFound();

  const t = await getTranslations({ locale, namespace: "clientReview" });
  const siteHref = locale === "en" ? "/?lang=en" : "/";
  const known = data.request.state !== "invalid";

  return (
    <SiteThemeProvider locale={locale} colors={data.colors} theme={data.theme}>
      <div className="cs-rv-page">
        <ReviewHeader coachName={data.coachName} logoUrl={data.logoUrl} />
        {known ? (
          <ReviewWithdraw token={token} coachName={data.coachName} siteHref={siteHref} />
        ) : (
          <ReviewExpired
            coachName={data.coachName}
            whatsappHref={newLinkHref(data.whatsapp, t("expired.askNewText", { coach: data.coachName }))}
            siteHref={siteHref}
          />
        )}
        <ReviewFooter />
      </div>
    </SiteThemeProvider>
  );
}
