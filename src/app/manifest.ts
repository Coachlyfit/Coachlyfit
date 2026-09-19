import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coachlyfit",
    short_name: "Coachlyfit",
    description: "Coach your clients your way.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0F172A",
    icons: [
      { src: "/brand/app-icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/brand/favicon.png", sizes: "48x48", type: "image/png" },
    ],
    screenshots: [
      {
        src: `${siteUrl}/opengraph-image`,
        sizes: "1200x630",
        type: "image/png",
        form: "wide",
      },
    ],
    categories: ["business", "productivity", "health"],
    lang: "en",
    dir: "ltr",
  };
}
