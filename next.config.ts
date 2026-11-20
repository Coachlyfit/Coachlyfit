
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.26.64.1"],
  // Inline CSS in <head> to remove render-blocking stylesheet requests (prod only).
  experimental: { inlineCss: true },
  // Next unconditionally ships polyfill-module (trimStart, flat, Object.hasOwn, ...);
  // all supported by our target browsers (chrome/edge/firefox 111+, safari 16.4+).
  turbopack: {
    resolveAlias: {
      "../build/polyfills/polyfill-module": "./src/lib/empty.ts",
    },
  },
  // The service worker must always be re-fetched (a stale cached sw.js would
  // pin users to an old offline cache) — see Next's PWA guide, "Securing your
  // application".
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
