import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { buildAlternates } from "@/lib/seo";
import { cn } from "@/lib/utils";

const EYEBROW = "font-mono text-[11px] font-medium uppercase tracking-[0.13em] text-primary";
const PRINCIPLES = ["arabic", "onePlace", "brand", "money"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "marketing.about" });
  const alternates = buildAlternates(locale, "/about");

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: true, follow: true },
    alternates,
    openGraph: {
      type: "website",
      title: t("metaTitle"),
      description: t("metaDescription"),
      url: alternates.canonical,
    },
  };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "marketing.about" });

  return (
    <>
      <section className="mx-auto max-w-[1200px] px-4 py-20 sm:py-24">
        <div className={EYEBROW}>{t("eyebrow")}</div>
        <h1 className="mt-4 max-w-[22ch] text-balance text-3xl font-semibold leading-tight tracking-[-0.025em] md:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-6 max-w-[64ch] text-pretty text-lg leading-relaxed text-muted-foreground">{t("intro")}</p>
      </section>

      <section className="bg-muted/40 py-20 sm:py-22">
        <div className="mx-auto max-w-[1200px] px-4">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">{t("whatTitle")}</h2>
          <p className="mt-4 max-w-[64ch] text-pretty leading-relaxed text-muted-foreground">{t("whatBody")}</p>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-20 sm:py-22">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">{t("principlesTitle")}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {PRINCIPLES.map((key) => (
            <div key={key} className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
              <h3 className="text-[17px] font-semibold">{t(`principles.${key}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`principles.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="dark bg-background py-20 text-foreground sm:py-22">
        <div className="mx-auto max-w-[1200px] px-4">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] md:text-3xl">{t("ctaTitle")}</h2>
          <p className="mt-3 text-muted-foreground">{t("ctaBody")}</p>
          <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "mt-6")}>
            {t("cta")}
          </Link>
        </div>
      </section>
    </>
  );
}
