import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { LEGAL_SLUGS, LEGAL_VERSION } from "@/content/legal/constants";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const publicPages = ["", "/login", "/signup", "/forgot-password"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return routing.locales.flatMap((locale) => [
    ...publicPages.map((page) => ({
      url: `${siteUrl}/${locale}${page}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: page === "" ? 1 : 0.7,
    })),
    ...LEGAL_SLUGS.map((slug) => ({
      url: `${siteUrl}/${locale}/legal/${slug}`,
      lastModified: new Date(LEGAL_VERSION),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ]);
}
