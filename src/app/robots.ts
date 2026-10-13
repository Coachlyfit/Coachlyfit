import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/seo";

// First path segment of every signed-in area, after the locale. Auth pages
// (/login, /signup, …) are left crawlable on purpose: they carry noindex,
// which a crawler can only see if it is allowed to fetch the page.
const PRIVATE_SEGMENTS = [
  "admin",
  "onboarding",
  "print",
  "dashboard",
  "clients",
  "programs",
  "diets",
  "forms",
  "library",
  "inbox",
  "messages",
  "invoices",
  "billing",
  "finance",
  "review",
  "settings",
  "tasks",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          ...routing.locales.flatMap((locale) => [
            // The client area is /c. A bare "/c" prefix would also match /clients.
            `/${locale}/c$`,
            `/${locale}/c/`,
            ...PRIVATE_SEGMENTS.map((segment) => `/${locale}/${segment}`),
          ]),
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
