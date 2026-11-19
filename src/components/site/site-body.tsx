import { Fragment } from "react";
import { useTranslations } from "next-intl";
import type { SiteView } from "@/domain/sites/public-site";
import { orderSections, type SectionKey } from "@/domain/sites/site-content";
import { SiteAbout } from "./site-about";
import { SiteCta } from "./site-cta";
import { SiteFaq } from "./site-faq";
import { SiteFooter } from "./site-footer";
import { contactHref, SiteHero } from "./site-hero";
import { SiteHowItWorks } from "./site-how-it-works";
import { SiteResults } from "./site-results";
import { namedServices, SiteServices } from "./site-services";
import { SiteTestimonials } from "./site-testimonials";

/** Which sections have something to show. Results and reviews hide entirely
 * when empty; so do about / services / faq the coach hasn't filled in. */
export function visibleSections(view: SiteView): Set<SectionKey> {
  const { about, faq } = view.content;
  const has: Partial<Record<SectionKey, boolean>> = {
    // The photo shows in the hero, so About needs real text or stats of its own.
    about: !!(about.bio.trim() || about.certs.length || about.years !== null || about.clients !== null),
    services: namedServices(view).length > 0,
    results: view.results.length > 0,
    reviews: view.reviews.length > 0,
    faq: faq.some((f) => f.q.trim() !== ""),
  };
  return new Set(orderSections(view.content.sections).filter((k) => has[k] ?? true));
}

/** The whole one-page site, rendered from a SiteView. Used by the real site
 * and by the editor's live preview (so they can't drift). Wrap in
 * <SiteThemeProvider>. */
export function SiteBody({ view, year }: { view: SiteView; year: number }) {
  const t = useTranslations("site.hero");
  const visible = visibleSections(view);
  const order = orderSections(view.content.sections).filter((k) => visible.has(k));
  const contact = contactHref(view, t("whatsappText", { name: view.coachName }), visible) ?? "#cta";

  const render = (key: SectionKey) => {
    switch (key) {
      case "hero":
        return <SiteHero view={view} visible={visible} hasResults={visible.has("results")} hasReviews={visible.has("reviews")} />;
      case "about":
        return <SiteAbout view={view} />;
      case "services":
        return <SiteServices view={view} contactHref={contact} />;
      case "results":
        return <SiteResults results={view.results} />;
      case "reviews":
        return <SiteTestimonials reviews={view.reviews} />;
      case "how":
        return <SiteHowItWorks view={view} />;
      case "faq":
        return <SiteFaq view={view} />;
      case "cta":
        return <SiteCta view={view} />;
      case "footer":
        return <SiteFooter view={view} year={year} />;
    }
  };

  // Landmarks: everything but the footer is <main>; the footer is contentinfo.
  const body = order.filter((k) => k !== "footer");
  return (
    <>
      <main>
        {body.map((key) => (
          <Fragment key={key}>{render(key)}</Fragment>
        ))}
      </main>
      {order.includes("footer") && render("footer")}
    </>
  );
}
