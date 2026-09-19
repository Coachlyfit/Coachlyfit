import { useTranslations } from "next-intl";
import { hasLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CoachlyMark } from "@/components/brand/coachly-mark";
import { Hero } from "@/components/marketing/hero";
import { AppPreview } from "@/components/marketing/app-preview";
import { StatsBand, ProblemSection, Coaches, Faq } from "@/components/marketing/marketing-sections";
import { FeatureSections } from "@/components/marketing/feature-sections";
import { ArabicFirst } from "@/components/marketing/arabic-first";
import { PricingSection } from "@/components/marketing/pricing-section";

/**
 * Static mark, not ApertureSweep: this sits below the fold, and the brand's
 * one specified motion belongs to the hero's first paint.
 *
 * No `dark` wrapper here, unlike the footer: `--sidebar` is already a dark
 * ground in light mode (#0F172A) with light-on-dark sidebar-* foregrounds, so
 * flipping the subtree would drop it to #020617 and make this section
 * indistinguishable from the footer directly below it.
 */
function FinalCta() {
  const t = useTranslations("marketing.finalCta");

  return (
    <section className="bg-sidebar py-20 text-center text-sidebar-foreground sm:py-23">
      <div className="mx-auto max-w-[1200px] px-4">
        <CoachlyMark size={82} className="mx-auto mb-7 text-sidebar-foreground" aria-hidden="true" />
        <h2 className="text-balance text-3xl font-semibold leading-[1.15] tracking-[-0.028em] md:text-[42px]">
          {t("title")}
        </h2>
        <p className="mx-auto mt-4 max-w-[52ch] text-pretty text-[17px] leading-relaxed text-sidebar-foreground/60">
          {t("subtitle")}
        </p>
        <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "mt-8 h-14 px-8 text-base")}>
          {t("cta")}
        </Link>
      </div>
    </section>
  );
}

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function jsonLd(locale: AppLocale) {
  const isAr = locale === "ar";
  const description = isAr
    ? "نماذج، برامج تدريبية، متابعات وفواتير في مكان واحد — مبني لمدربي اللياقة في مصر والمنطقة."
    : "Forms, programs, check-ins and invoices in one place — built for fitness coaches in Egypt and the region.";

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "Coachlyfit",
        url: siteUrl,
        logo: `${siteUrl}/brand/app-icon.svg`,
        description,
        sameAs: [],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "Coachlyfit",
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: locale,
      },
      {
        "@type": "WebPage",
        "@id": `${siteUrl}/${locale}/#webpage`,
        url: `${siteUrl}/${locale}`,
        name: "Coachlyfit — Coach your clients your way",
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#organization` },
        description,
        inLanguage: locale,
      },
      {
        "@type": "SoftwareApplication",
        name: "Coachlyfit",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: `${siteUrl}/${locale}`,
        description,
        offers: {
          "@type": "Offer",
          availability: "https://schema.org/InStock",
          price: "0",
          priceCurrency: "EGP",
        },
        publisher: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: isAr ? "هل يحتاج عميلي إلى تطبيق؟" : "Does my client need to install an app?",
            acceptedAnswer: {
              "@type": "Answer",
              text: isAr
                ? "لا. يتلقى رابطًا عبر واتساب، يفتحه في متصفحه ويجب. لا حساب، لا تنزيل."
                : "No. They get a link over WhatsApp, open it in their browser, and answer. No account, no download.",
            },
          },
          {
            "@type": "Question",
            name: isAr ? "هل يمكنني نقل عملائي من جدول بيانات؟" : "Can I move my clients over from a spreadsheet?",
            acceptedAnswer: {
              "@type": "Answer",
              text: isAr
                ? "نعم. الصق القائمة كما هي وسنطابق الأعمدة ونعرض لك النتيجة قبل الاستيراد."
                : "Yes. Paste the list exactly as it is and we'll match the columns and show you the result before anything is imported.",
            },
          },
          {
            "@type": "Question",
            name: isAr ? "كيف أحصل على أرباحي؟" : "How do I get paid?",
            acceptedAnswer: {
              "@type": "Answer",
              text: isAr
                ? "انستاباي أو فوري أو فيزا. المال يذهب مباشرة إلى حسابك."
                : "InstaPay, Fawry or Visa. Money goes straight to your account, and we don't take a cut.",
            },
          },
          {
            "@type": "Question",
            name: isAr ? "ماذا لو كان لدي عملاء أكثر من(plan يسمح)؟" : "What if I have more clients than my plan allows?",
            acceptedAnswer: {
              "@type": "Answer",
              text: isAr
                ? "يمكنك الترقية في أي وقت والفرق يُحسب نسبيًا للأيام المتبقية."
                : "You can move up a plan at any time and the difference is prorated across the remaining days.",
            },
          },
          {
            "@type": "Question",
            name: isAr ? "أين يتم تخزين صور العملاء؟" : "Where are client photos stored?",
            acceptedAnswer: {
              "@type": "Answer",
              text: isAr
                ? "مشفرة ومرئية لك فقط. يمكن للعميل طلب حذفها في أي وقت."
                : "Encrypted, and visible only to you. A client can ask for them to be deleted at any time.",
            },
          },
        ],
      },
    ],
  };
}

export default async function MarketingHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const appLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;

  return (
    <>
      {/* JSON-LD: static, server-generated from our own data — not user input, safe to inline */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(appLocale)) }}
      />
      <Hero />
      <AppPreview />
      <StatsBand />
      <ProblemSection />
      <FeatureSections />
      <ArabicFirst />
      <Coaches />
      <PricingSection />
      <Faq />
      <FinalCta />
    </>
  );
}
