"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { SiteBody } from "@/components/site/site-body";
import { SiteThemeProvider } from "@/components/site/site-theme-provider";
import type { SiteView } from "@/domain/sites/public-site";
import type { SectionKey } from "@/domain/sites/site-content";
import { cn } from "@/lib/utils";

export type PreviewDevice = "phone" | "desktop";
export type PreviewLang = "ar" | "en";

const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;
const DESKTOP_ZOOM = 0.5;

/** One section made click-selectable. Not a <button>: it wraps whole sections
 * (headings, lists). The section list beside the preview is the keyboard path;
 * this is the pointer one, and stays reachable by Tab all the same. */
function Pick({
  name,
  selected,
  onSelect,
  children,
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={name}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onSelect();
      }}
      className={cn(
        "relative cursor-pointer outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        selected && "outline-2 -outline-offset-2 outline-primary"
      )}
    >
      {selected && (
        <span className="absolute start-3 top-0 z-10 rounded-b-md bg-primary px-2.5 py-0.5 font-sans text-xs font-medium text-primary-foreground">
          {name}
        </span>
      )}
      {/* inert: a click anywhere lands on the wrapper and selects, and the
          section's own links and buttons leave the tab order. */}
      <div inert>{children}</div>
    </div>
  );
}

/** The real site components, rendered from the local draft (so it updates as
 * you type, without waiting for the save). The editor's own language doesn't
 * matter: the preview gets its own intl provider with the site messages of
 * the language being previewed. The site lays out by container width, so the
 * 390px and 1280px frames behave like real phones and desktops. */
export function SitePreview({
  view,
  device,
  lang,
  scheme,
  siteMessages,
  selected,
  onSelect,
  sectionNames,
}: {
  view: SiteView;
  device: PreviewDevice;
  lang: PreviewLang;
  /** Light or dark, so the coach can check both (visitors follow their system). */
  scheme: "light" | "dark";
  siteMessages: Record<PreviewLang, AbstractIntlMessages>;
  /** The section open in the inspector, outlined in the preview. */
  selected: SectionKey | null;
  onSelect: (key: SectionKey) => void;
  /** Dashboard-language section names, for the outline badge and screen readers. */
  sectionNames: Record<SectionKey, string>;
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
            <SiteThemeProvider locale={lang} colors={view.colors} theme={view.theme} scheme={scheme}>
              <SiteBody
                view={view}
                year={new Date().getFullYear()}
                wrap={(key, node) => (
                  <Pick name={sectionNames[key]} selected={selected === key} onSelect={() => onSelect(key)}>
                    {node}
                  </Pick>
                )}
              />
            </SiteThemeProvider>
          </NextIntlClientProvider>
        </div>
      </div>
    </div>
  );
}
