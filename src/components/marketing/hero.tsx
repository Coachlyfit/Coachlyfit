import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { ApertureSweep } from "@/components/brand/aperture-sweep";
import { cn } from "@/lib/utils";
import type { SectionContent, SectionSettings } from "@/domain/marketing/sections.schema";

/**
 * The mark's sweep is the hero's only motion. ApertureSweep runs it once and
 * rests — the design mock loops it every 3400ms, but the brand motion spec's
 * "Don't" list rules out ambient looping, and the component already encodes
 * that plus the reduced-motion cross-fade.
 *
 * An uploaded image takes the mark's place. `imagePosition` only moves that
 * column: beside the text from `lg` up, or under it at every width.
 */
export function Hero({
  content,
  imageUrl,
  imagePosition,
}: {
  content: SectionContent<"hero">;
  imageUrl: string | null;
  imagePosition: SectionSettings["image_position"];
}) {
  return (
    <section
      className={cn(
        "mx-auto grid max-w-[1200px] items-center gap-12 px-4 pt-16 sm:pt-20 lg:gap-14 lg:pt-22",
        imagePosition === "side" && "lg:grid-cols-[1.05fr_.95fr]"
      )}
    >
      <div>
        {content.badge && (
          <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-accent-tint px-3.5 py-1.5 text-xs font-medium text-accent-tint-foreground">
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            {content.badge}
          </span>
        )}
        <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.03em] md:text-5xl lg:text-6xl">
          {content.title}
        </h1>
        <p className="mt-5 max-w-[48ch] text-pretty text-lg leading-relaxed text-muted-foreground">
          {content.subtitle}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          {content.cta && (
            <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "h-14 px-7 text-base")}>
              {content.cta}
            </Link>
          )}
          {content.ctaSecondary && (
            <a
              href="#features"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-14 gap-2.5 px-6 text-base")}
            >
              <svg viewBox="0 0 9 11" className="h-3.5 w-3" fill="currentColor" aria-hidden="true">
                <path d="M0 0 L9 5.5 L0 11 Z" />
              </svg>
              {content.ctaSecondary}
            </a>
          )}
        </div>
        {content.trialNote && <p className="mt-5 text-sm text-muted-foreground">{content.trialNote}</p>}
      </div>

      <div className="flex justify-center" aria-hidden="true">
        {imageUrl ? (
          // Decorative, like the mark it replaces. A plain <img>: the file is
          // an admin upload in a public bucket, same as coach logos.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-auto w-full max-w-[560px] rounded-2xl" />
        ) : (
          // size={420} sets the intrinsic box; h-auto lets the square viewBox
          // keep its ratio while max-w scales it down on narrow screens.
          <ApertureSweep
            size={420}
            className="h-auto w-full max-w-[260px] text-foreground sm:max-w-[340px] lg:max-w-[420px]"
          />
        )}
      </div>
    </section>
  );
}
