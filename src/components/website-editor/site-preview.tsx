"use client";

import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { SiteBody } from "@/components/site/site-body";
import { SiteThemeProvider } from "@/components/site/site-theme-provider";
import type { SiteView } from "@/domain/sites/public-site";

export type PreviewDevice = "phone" | "desktop";
export type PreviewLang = "ar" | "en";

const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;
const DESKTOP_ZOOM = 0.5;

/** The real site components, rendered from the local draft (so it updates as
 * you type, without waiting for the save). The editor's own language doesn't
 * matter: the preview gets its own intl provider with the site messages of
 * the language being previewed. The site lays out by container width, so the
 * 390px and 1280px frames behave like real phones and desktops. */
export function SitePreview({
  view,
  device,
  lang,
  siteMessages,
}: {
  view: SiteView;
  device: PreviewDevice;
  lang: PreviewLang;
  siteMessages: Record<PreviewLang, AbstractIntlMessages>;
}) {
  const isDesktop = device === "desktop";
  return (
    <div className="overflow-auto rounded-2xl bg-muted/40 p-3 ring-1 ring-foreground/10">
      <div
        className="mx-auto overflow-hidden rounded-xl bg-background shadow-sm ring-1 ring-foreground/15"
        style={{ width: isDesktop ? DESKTOP_WIDTH * DESKTOP_ZOOM : `min(${PHONE_WIDTH}px, 100%)` }}
      >
        <div style={isDesktop ? { width: DESKTOP_WIDTH, zoom: DESKTOP_ZOOM } : undefined}>
          <NextIntlClientProvider locale={lang} messages={{ site: siteMessages[lang] }}>
            <SiteThemeProvider locale={lang} colors={view.colors}>
              <SiteBody view={view} year={new Date().getFullYear()} />
            </SiteThemeProvider>
          </NextIntlClientProvider>
        </div>
      </div>
    </div>
  );
}
