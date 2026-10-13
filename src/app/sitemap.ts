import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { LEGAL_SLUGS, LEGAL_VERSION } from "@/content/legal/constants";
import { SITE_URL } from "@/lib/seo";

// Indexable pages only. Auth pages are noindex (see (auth)/layout.tsx) and
// "/" redirects to the default locale, so neither belongs here.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const languages = (path: string) =>
    Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}/${l}${path}`]));

  return routing.locales.flatMap((locale) => [
    {
      url: `${SITE_URL}/${locale}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 1,
      alternates: { languages: languages("") },
    },
    ...LEGAL_SLUGS.map((slug) => ({
      url: `${SITE_URL}/${locale}/legal/${slug}`,
      lastModified: new Date(LEGAL_VERSION),
      changeFrequency: "yearly" as const,
      priority: 0.3,
      alternates: { languages: languages(`/legal/${slug}`) },
    })),
  ]);
}
