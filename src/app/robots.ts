import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/dashboard/",
          "/c/",
          "/onboarding/",
          "/settings/",
          "/billing/",
          "/inbox/",
          "/library/",
          "/programs/",
          "/diets/",
          "/forms/",
          "/clients/",
          "/review/",
          "/print/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
