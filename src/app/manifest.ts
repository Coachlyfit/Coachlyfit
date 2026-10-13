import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/seo";

// One manifest for both locales, so it follows the Arabic-first default
// (routing.defaultLocale). start_url "/" lets proxy.ts redirect each install
// to the user's saved locale, so English users still land on /en.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Coachlyfit",
    short_name: "Coachlyfit",
    description: "درّب عملاءك بطريقتك — Coach your clients your way.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0F172A",
    icons: [
      { src: "/brand/app-icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      {
        src: `${SITE_URL}/opengraph-image`,
        sizes: "1200x630",
        type: "image/png",
        form_factor: "wide",
      },
    ],
    categories: ["business", "productivity", "health"],
    lang: routing.defaultLocale,
    dir: "rtl",
  };
}
