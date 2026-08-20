import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { ApertureSweep } from "@/components/brand/aperture-sweep";
import { cn } from "@/lib/utils";

/**
 * The mark's sweep is the hero's only motion. ApertureSweep runs it once and
 * rests — the design mock loops it every 3400ms, but the brand motion spec's
 * "Don't" list rules out ambient looping, and the component already encodes
 * that plus the reduced-motion cross-fade.
 */
export function Hero() {
  const t = useTranslations("marketing.hero");

  return (
    <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pt-16 sm:pt-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:pt-22">
      <div>
        <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-accent-tint px-3.5 py-1.5 text-xs font-medium text-accent-tint-foreground">
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          {t("badge")}
        </span>
        <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.03em] md:text-5xl lg:text-6xl">
          {t("title")}
        </h1>
        <p className="mt-5 max-w-[48ch] text-pretty text-lg leading-relaxed text-muted-foreground">
          {t("subtitle")}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "h-14 px-7 text-base")}>
            {t("cta")}
          </Link>
          <a
            href="#pricing"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-14 px-6 text-base")}
          >
            {t("ctaSecondary")}
          </a>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">{t("trialNote")}</p>
      </div>

      <div className="flex justify-center" aria-hidden="true">
        {/* size={420} sets the intrinsic box; h-auto lets the square viewBox
            keep its ratio while max-w scales it down on narrow screens. */}
        <ApertureSweep
          size={420}
          className="h-auto w-full max-w-[260px] text-foreground sm:max-w-[340px] lg:max-w-[420px]"
        />
      </div>
    </section>
  );
}
