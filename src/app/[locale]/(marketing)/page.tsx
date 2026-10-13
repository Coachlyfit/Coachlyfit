import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { routing, type AppLocale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { MarketingService } from "@/domain/marketing/marketing.service";
import type { Section } from "@/domain/marketing/sections.schema";
import { SectionView } from "@/components/marketing/section-view";
import { PRICING_TIER_COLUMNS } from "@/components/marketing/pricing-section";
import { SITE_URL as siteUrl, buildAlternates } from "@/lib/seo";

// "/" redirects to the default locale, so structured data points at the
// final URL instead.
const homeUrl = `${siteUrl}/${routing.defaultLocale}`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const appLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  return { alternates: buildAlternates(appLocale) };
}

type FaqItem = { q: string; a: string };

function jsonLd(locale: AppLocale, faq: FaqItem[]) {
  const isAr = locale === "ar";
  const description = isAr
    ? "نماذج، برامج تدريبية، متابعات وفواتير في مكان واحد — مبني لمدربي اللياقة في مصر والمنطقة."
    : "Forms, programs, check-ins and invoices in one place — built for fitness coaches in Egypt and the region.";

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "Coachlyfit",
        url: homeUrl,
        logo: `${siteUrl}/brand/app-icon.svg`,
        description,
        sameAs: [],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: homeUrl,
        name: "Coachlyfit",
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: locale,
      },
      {
        "@type": "WebPage",
        "@id": `${siteUrl}/${locale}/#webpage`,
        url: `${siteUrl}/${locale}`,
        name: "Coachlyfit — Coach your clients your way",
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#organization` },
        description,
        inLanguage: locale,
      },
      {
        "@type": "SoftwareApplication",
        name: "Coachlyfit",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: `${siteUrl}/${locale}`,
        description,
        offers: {
          "@type": "Offer",
          availability: "https://schema.org/InStock",
          price: "0",
          priceCurrency: "EGP",
        },
        publisher: { "@id": `${siteUrl}/#organization` },
      },
      // Built from the published FAQ section, so the structured data can't
      // say something the page doesn't. Left out when there are no questions.
      ...(faq.length > 0
        ? [
            {
              "@type": "FAQPage",
              mainEntity: faq.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: { "@type": "Answer", text: item.a },
              })),
            },
          ]
        : []),
    ],
  };
}

function faqItems(sections: Section[], locale: AppLocale): FaqItem[] {
  return sections.flatMap((s) =>
    s.type === "faq" ? (locale === "ar" ? s.content_ar : s.content_en).items.filter((i) => i.q && i.a) : []
  );
}

export default async function MarketingHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const appLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;

  // Only what an admin has published (see /admin/site); the draft is never
  // read here. Tiers are fetched alongside for the pricing section.
  const supabase = await createClient();
  const [published, { data: tiers }] = await Promise.all([
    new MarketingService(supabase).getPublished("home"),
    supabase
      .from("subscription_tiers")
      .select(PRICING_TIER_COLUMNS)
      .eq("is_active", true)
      .order("price_egp_monthly", { ascending: true }),
  ]);
  const sections = published.filter((s) => s.is_visible);

  return (
    <>
      {/* JSON-LD: server-generated from our own data and admin-written copy.
          "<" is escaped so no text can close the script element. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd(appLocale, faqItems(sections, appLocale))).replace(/</g, "\\u003c"),
        }}
      />
      {sections.map((section) => (
        <SectionView key={section.id} section={section} locale={appLocale} tiers={tiers ?? []} />
      ))}
    </>
  );
}
