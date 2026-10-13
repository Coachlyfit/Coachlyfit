import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "always",
  // hreflang comes from page metadata (buildAlternates in src/lib/seo.ts).
  // The middleware's Link header would be a second source, built from the
  // request host and pointing x-default at "/", which redirects.
  alternateLinks: false,
});

export type AppLocale = (typeof routing.locales)[number];
