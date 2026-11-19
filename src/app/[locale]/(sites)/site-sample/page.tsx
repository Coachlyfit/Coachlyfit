import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { SiteBody } from "@/components/site/site-body";
import { SiteThemeProvider } from "@/components/site/site-theme-provider";
import { sampleView } from "@/domain/sites/sample";
import { routing } from "@/i18n/routing";

// Dev-only preview of the seeded "Coach Ahmed" site at /ar/site-sample.
// Stress-test with ?results=0&reviews=0&services=2&longName=1&noPhoto=1
// &primary=%231d4ed8&accent=%232563eb. Always 404 in production.
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const int = (v: string | string[] | undefined) => {
  const n = parseInt(one(v) ?? "", 10);
  return Number.isNaN(n) ? undefined : n;
};

export default async function SamplePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || process.env.NODE_ENV === "production") notFound();
  setRequestLocale(locale);

  const sp = await searchParams;
  const view = sampleView(locale, {
    results: int(sp.results),
    reviews: int(sp.reviews),
    services: int(sp.services),
    longName: one(sp.longName) === "1",
    noPhoto: one(sp.noPhoto) === "1",
    primary: one(sp.primary),
    accent: one(sp.accent),
  });

  return (
    <SiteThemeProvider locale={locale} colors={view.colors}>
      <SiteBody view={view} year={new Date().getFullYear()} />
    </SiteThemeProvider>
  );
}
