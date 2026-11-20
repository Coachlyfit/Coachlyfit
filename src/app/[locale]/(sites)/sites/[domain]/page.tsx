import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ComingSoon } from "@/components/site/coming-soon";
import { SiteBody } from "@/components/site/site-body";
import { SiteThemeProvider } from "@/components/site/site-theme-provider";
import { toSiteView } from "@/domain/sites/public-site";
import { parseDraft } from "@/domain/sites/site-content";
import { guardColors } from "@/domain/sites/theme";
import { routing } from "@/i18n/routing";
import { siteAlternates } from "@/lib/sites/origin";
import { getPublicSite } from "@/lib/sites/public-site";

// The proxy rewrites a coach's domain to /<lang>/sites/<domain>.
//
// Rendered per request, NOT as a cached static page: the root [locale] layout
// reads platform settings through a cookie-based Supabase client, which is a
// request-time API. A static/ISR render of this route therefore throws
// DYNAMIC_SERVER_USAGE in production. The expensive part (the database read)
// is still cached: getPublicSite() uses unstable_cache with tags, refreshed
// when the coach publishes (revalidateTag), on consent withdrawal, and every
// 5 minutes.
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; domain: string }>;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, domain } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const site = await getPublicSite(decodeURIComponent(domain));
  if (!site) return { robots: { index: false, follow: false } };

  const name = site.coach.business_name;
  if (!site.is_published) {
    // "Coming soon": nothing to index.
    return { title: { absolute: name }, applicationName: name, robots: { index: false, follow: false } };
  }

  const view = toSiteView(site, SUPABASE_URL, locale);
  const t = await getTranslations({ locale, namespace: "site.hero" });
  const eyebrow = view.content.hero.title.trim();
  const title = eyebrow ? `${name} | ${eyebrow}` : name;
  const description = view.content.hero.intro.trim() || t("eyebrow");
  const alternates = siteAlternates(site, locale);

  return {
    title: { absolute: title },
    applicationName: name,
    description,
    alternates,
    robots: { index: true, follow: true },
    icons: view.logoUrl ? { icon: view.logoUrl } : undefined,
    openGraph: {
      type: "website",
      siteName: name,
      title,
      description,
      url: alternates.canonical,
      locale: locale === "ar" ? "ar_EG" : "en_US",
      images: view.logoUrl ? [{ url: view.logoUrl }] : undefined,
    },
  };
}

export default async function SitePage({ params }: { params: Params }) {
  const { locale, domain } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const site = await getPublicSite(decodeURIComponent(domain));
  if (!site) notFound();

  if (!site.is_published) {
    const colors = guardColors(site.coach.brand_primary, site.coach.brand_accent);
    const view = toSiteView(site, SUPABASE_URL, locale);
    return (
      <SiteThemeProvider locale={locale} colors={colors} theme={parseDraft({ theme: site.theme }).theme}>
        <ComingSoon coachName={site.coach.business_name} logoUrl={view.logoUrl} />
      </SiteThemeProvider>
    );
  }

  const view = toSiteView(site, SUPABASE_URL, locale);
  return (
    <SiteThemeProvider locale={locale} colors={view.colors} theme={view.theme}>
      <SiteBody view={view} year={new Date().getFullYear()} siteKey={decodeURIComponent(domain)} />
    </SiteThemeProvider>
  );
}
