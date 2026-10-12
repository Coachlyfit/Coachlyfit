"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { Section } from "@/domain/marketing/sections.schema";
import { Navbar } from "@/components/marketing/navbar";
import { SectionView } from "@/components/marketing/section-view";
import type { PricingTier } from "@/components/marketing/pricing-section";

/** Messages between the editor and this frame. Same origin on both sides,
 * and both sides check it. */
export type PreviewMessage =
  | { type: "cms:ready" }
  | { type: "cms:state"; sections: Section[]; selectedId: string | null }
  | { type: "cms:select"; id: string };

export function PreviewClient({ locale, tiers }: { locale: AppLocale; tiers: PricingTier[] }) {
  const t = useTranslations("admin.site");
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent<PreviewMessage>) {
      if (event.origin !== window.location.origin || event.data?.type !== "cms:state") return;
      setSections(event.data.sections);
      setSelectedId(event.data.selectedId);
    }
    window.addEventListener("message", onMessage);
    // Tells the editor this document is listening; it answers with the draft.
    window.parent.postMessage({ type: "cms:ready" } satisfies PreviewMessage, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const select = (id: string) =>
    window.parent.postMessage({ type: "cms:select", id } satisfies PreviewMessage, window.location.origin);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* The real navbar, as a picture: it's part of how the page looks, but
          nothing in the preview navigates. */}
      <div inert>
        <Navbar />
      </div>
      <main className="flex-1">
        {sections.map((section) => {
          const selected = section.id === selectedId;
          return (
            // Not a <button>: it wraps whole sections (headings, lists). The
            // section list beside the preview is the keyboard path; this is
            // the pointer one, and stays reachable by Tab all the same.
            <div
              key={section.id}
              ref={selected ? selectedRef : undefined}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={t(`types.${section.type}`)}
              onClick={() => select(section.id)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                select(section.id);
              }}
              className={cn(
                "relative cursor-pointer outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                selected && "z-10 outline-2 -outline-offset-2 outline-primary",
                // Hidden sections stay in the preview so they can be picked
                // and switched back on; they are not on the public page.
                !section.is_visible && "opacity-40"
              )}
            >
              {selected && (
                <span className="absolute start-3 top-0 z-10 rounded-b-md bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                  {t(`types.${section.type}`)} · {t(section.is_visible ? "preview.selected" : "preview.hidden")}
                </span>
              )}
              {/* inert: a click anywhere lands on the wrapper and selects,
                  and the section's own links and buttons leave the tab order. */}
              <div inert>
                <SectionView section={section} locale={locale} tiers={tiers} />
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
