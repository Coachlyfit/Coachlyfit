import { cn } from "@/lib/utils";

/** Inlines a coach's brand overrides. `css` comes from brandCss(), which only
 * ever emits normalized hex values, so it's safe as raw style text. */
export function BrandStyle({ css }: { css: string }) {
  if (!css) return null;
  return <style data-coach-brand dangerouslySetInnerHTML={{ __html: css }} />;
}

/** The coach's logo in place of the Coachlyfit mark. Sits on a white chip so
 * any logo reads on the navy sidebar and in dark mode alike. */
export function BrandLogo({ src, name, className }: { src: string; name: string; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-md bg-white p-1 ring-1 ring-black/5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL, arbitrary aspect ratio */}
      <img src={src} alt={name} className="h-6 w-auto max-w-32 object-contain" />
    </span>
  );
}
