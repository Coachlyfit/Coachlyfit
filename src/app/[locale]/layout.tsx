import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { fontMono, fontSans } from "@/lib/fonts";
import { Providers } from "@/components/providers/providers";
import "../globals.css";

export const metadata: Metadata = {
  title: "Coachly",
  description: "Coach your clients your way.",
  // Favicon: src/app/icon.svg (light, file-convention) plus an explicit
  // dark-mode pairing here, per identity spec v2 (`brand id/README.md`,
  // "Favicon"). v1 tried to switch light/dark *inside* the SVG via an
  // embedded `prefers-color-scheme` media query and a `.a`/`.b` style block
  // that never matched — every tab showed a black dot, since Next's static
  // icon route strips inline <style> resolution in some consumers. v2
  // drops that entirely: two plain files, switched by the `media` attribute
  // on the <link> itself, which is honoured by Chrome and Firefox. Safari
  // and non-rendering consumers (crawlers, PWA manifest tooling) degrade to
  // the light file — that's expected, not a bug (see README).
  // apple-touch-icon (apple-icon.tsx) is unaffected, file-convention as before.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      {
        url: "/brand/favicon-dark.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

// viewportFit: "cover" is required for the fixed bottom nav bars
// (ClientNav, BottomNav) to get a non-zero env(safe-area-inset-bottom) on
// iOS Safari — without it the tab bar sits under the home indicator.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
  viewportFit: "cover",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${fontSans.variable} ${fontMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
