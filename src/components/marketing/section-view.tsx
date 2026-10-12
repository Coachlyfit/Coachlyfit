import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { Section, SectionSettings } from "@/domain/marketing/sections.schema";
import { Hero } from "./hero";
import { AppPreview } from "./app-preview";
import { StatsBand, ProblemSection, Testimonials, HowItWorks, Faq, FinalCta } from "./marketing-sections";
import { FeatureSections } from "./feature-sections";
import { ArabicFirst } from "./arabic-first";
import { PricingSection, type PricingTier } from "./pricing-section";

export const MARKETING_BUCKET = "marketing";

/** Public URL of a file in the `marketing` bucket. Built by hand rather than
 * with a Supabase client so the server page and the client preview share it. */
export function marketingImageUrl(path: string | undefined): string | null {
  return path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${MARKETING_BUCKET}/${path}`
    : null;
}

// Navy is a `dark` subtree on the dark theme's card colour (#0f172a, the same
// navy as the sidebar), so cards, rules and muted copy inside a navy section
// resolve against dark tokens without any section knowing its ground.
const SECTION_BG: Record<SectionSettings["background"], string> = {
  white: "bg-background text-foreground",
  muted: "bg-muted/40 text-foreground",
  navy: "dark bg-card text-foreground",
};

function SectionBody({ section, locale, tiers }: { section: Section; locale: AppLocale; tiers: PricingTier[] }) {
  // Picked inside each case, not once above the switch: narrowing on
  // section.type is what ties the content to its component's props.
  switch (section.type) {
    case "hero":
      return (
        <Hero
          content={locale === "ar" ? section.content_ar : section.content_en}
          imageUrl={marketingImageUrl(section.settings.image_path)}
          imagePosition={section.settings.image_position}
        />
      );
    case "app_preview":
      return <AppPreview />;
    case "stats":
      return <StatsBand content={locale === "ar" ? section.content_ar : section.content_en} />;
    case "pain_points":
      return <ProblemSection content={locale === "ar" ? section.content_ar : section.content_en} />;
    case "features":
      return <FeatureSections content={locale === "ar" ? section.content_ar : section.content_en} />;
    case "arabic_first":
      return <ArabicFirst content={locale === "ar" ? section.content_ar : section.content_en} />;
    case "testimonials":
      return <Testimonials content={locale === "ar" ? section.content_ar : section.content_en} />;
    case "how_it_works":
      return <HowItWorks content={locale === "ar" ? section.content_ar : section.content_en} />;
    case "pricing":
      return <PricingSection content={locale === "ar" ? section.content_ar : section.content_en} tiers={tiers} />;
    case "faq":
      return <Faq content={locale === "ar" ? section.content_ar : section.content_en} />;
    case "final_cta":
      return <FinalCta content={locale === "ar" ? section.content_ar : section.content_en} />;
  }
}

/** One marketing section on its ground. The public page and the CMS preview
 * both render sections through this and nothing else, so what the admin sees
 * while editing is what gets published. */
export function SectionView({
  section,
  locale,
  tiers,
}: {
  section: Section;
  locale: AppLocale;
  tiers: PricingTier[];
}) {
  return (
    <div className={cn(SECTION_BG[section.settings.background])}>
      <SectionBody section={section} locale={locale} tiers={tiers} />
    </div>
  );
}
