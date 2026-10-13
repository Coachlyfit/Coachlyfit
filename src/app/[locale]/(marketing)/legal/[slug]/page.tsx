import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing, type AppLocale } from "@/i18n/routing";
import { LegalDocument } from "@/components/legal/legal-document";
import { LEGAL_SLUGS, getLegalDoc, isLegalSlug } from "@/content/legal";
import { buildAlternates } from "@/lib/seo";

// No `dynamicParams = false` here: it applies to the shared [locale] segment
// and 404s every other page. LegalPage calls notFound() for unknown slugs.
export function generateStaticParams() {
  return routing.locales.flatMap((locale) => LEGAL_SLUGS.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !isLegalSlug(slug)) return {};
  const doc = getLegalDoc(slug, locale);
  const alternates = buildAlternates(locale, `/legal/${slug}`);

  return {
    title: doc.title,
    description: doc.description,
    robots: { index: true, follow: true },
    alternates,
    openGraph: {
      type: "article",
      title: doc.title,
      description: doc.description,
      url: alternates.canonical,
    },
  };
}

export default async function LegalPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !isLegalSlug(slug)) notFound();
  setRequestLocale(locale);

  return <LegalDocument doc={getLegalDoc(slug, locale as AppLocale)} slug={slug} locale={locale as AppLocale} />;
}
