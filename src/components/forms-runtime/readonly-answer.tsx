"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { pickLocale, pickBilingual, type AppLocale } from "@/domain/locale";
import type { FormField } from "@/domain/forms/schema";
import type { LibraryRefOption } from "@/domain/forms/library-refs";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogOverlay } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Broken-image fallback rendered inline when a thumbnail can't be loaded
 *  or a signed URL couldn't be issued for a storage path. */
const PLACEHOLDER_SVG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><rect width='200' height='200' fill='%231f2937'/%><path d='M85 90h30v30h-30z' fill='%239ca3af'/%><circle cx='75' cy='70' r='8' fill='%239ca3af'/%><circle cx='125' cy='70' r='8' fill='%239ca3af'/%></svg>";

function isString(v: unknown): v is string {
  return typeof v === "string";
}

/** Normalises a photo answer to an array of storage paths. A photo field
 *  stores either a single path string or an array of path strings in the
 *  `answers` JSON column (all under the private `progress-media` bucket). */
function photoPaths(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(isString);
  if (isString(value)) return [value];
  return [];
}

function PhotoAnswer({
  field,
  value,
  locale,
  signedUrls,
}: {
  field: FormField;
  value: unknown;
  locale: AppLocale;
  signedUrls?: Record<string, string>;
}) {
  const t = useTranslations("forms.submissions");
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const paths = photoPaths(value);

  if (paths.length === 0) {
    return <span className="text-sm italic text-muted-foreground">—</span>;
  }

  // Without signed URLs (e.g. client-side fill review) fall back to the
  // previous text rendering so that flow is unchanged; signed URLs are only
  // available from the server-rendered coach review page.
  if (!signedUrls) {
    return (
      <span className="block text-sm break-all text-muted-foreground">
        {paths.length === 1 ? (paths[0].split("/").pop() ?? paths[0]) : paths.join(", ")}
      </span>
    );
  }

  const openLightbox = (path: string) => {
    const url = signedUrls?.[path];
    if (!url) return;
    setLightbox({ src: url, alt: path.split("/").pop() ?? path });
  };

  const onError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const target = event.target as HTMLImageElement;
    target.src = PLACEHOLDER_SVG;
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5" dir="auto">
        {paths.map((path, index) => {
          const url = signedUrls?.[path];
          const hasUrl = Boolean(url);
          const alt = path.split("/").pop() ?? path;
          return (
            <figure
              key={`${field.id}-${index}`}
              className={cn(
                "relative aspect-[3/4] rounded-md overflow-hidden border border-border/50 bg-muted group",
                hasUrl ? "cursor-pointer" : "",
              )}
              onClick={() => openLightbox(path)}
            >
              <img
                src={url ?? PLACEHOLDER_SVG}
                alt={alt}
                loading="lazy"
                decoding="async"
                className="aspect-[3/4] w-full h-full object-cover"
                onError={onError}
              />
              {!hasUrl && (
                <span className="absolute bottom-1 left-1 right-1 z-10 text-[10px] text-center bg-black/60 text-white rounded">
                  —
                </span>
              )}
              {hasUrl && (
                <button
                  type="button"
                  aria-label={t("view")}
                  className="absolute top-1 right-1 z-20 p-1 bg-black/50 text-white rounded hover:bg-black/70 focus:outline-none"
                  onClick={(event) => {
                    event.stopPropagation();
                    openLightbox(path);
                  }}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </figure>
          );
        })}
      </div>

      {lightbox && (
        <Dialog open onOpenChange={(open) => !open && setLightbox(null)}>
          <DialogOverlay className="bg-black/90" />
          <DialogContent className="p-0 bg-popover outline-none max-w-[90dvw] max-h-[90dvh]" showCloseButton={false}>
            <button
              type="button"
              aria-label="Close"
              className="absolute top-2 right-2 z-30 p-2 bg-black/60 text-white rounded-full focus:outline-none"
              onClick={(event) => {
                event.stopPropagation();
                setLightbox(null);
              }}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <img
              src={lightbox.src}
              alt={lightbox.alt}
              className="max-w-[90dvw] max-h-[90dvh] object-contain mx-auto outline-none"
              onError={onError}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function ReadonlyAnswer({
  field,
  value,
  locale,
  refOptions,
  signedUrls,
}: {
  field: FormField;
  value: unknown;
  locale: AppLocale;
  refOptions?: LibraryRefOption[];
  signedUrls?: Record<string, string>;
}) {
  if (value === undefined || value === null || value === "") {
    return <span className="text-sm italic text-muted-foreground">—</span>;
  }

  if (field.type === "checkbox") {
    return <span className="text-sm">{value ? "✓" : "—"}</span>;
  }

  if (field.type === "select" || field.type === "radio") {
    const option = field.options?.find((o) => o.value === value);
    return <span className="text-sm">{option ? pickBilingual(option.label, locale) : String(value)}</span>;
  }

  if (field.type === "multiselect" && Array.isArray(value)) {
    const labels = value.map((v) => {
      const option = field.options?.find((o) => o.value === v);
      return option ? pickBilingual(option.label, locale) : v;
    });
    return <span className="text-sm">{labels.join(", ")}</span>;
  }

  if (field.type === "scale") {
    return (
      <span className="text-sm tabular-nums">
        {String(value)} / {field.max ?? 5}
      </span>
    );
  }

  if (field.type === "photo") {
    return <PhotoAnswer field={field} value={value} locale={locale} signedUrls={signedUrls} />;
  }

  if ((field.type === "exercise_ref" || field.type === "food_ref") && typeof value === "string") {
    const ref = refOptions?.find((o) => o.id === value);
    return <span className="text-sm">{ref ? pickLocale(ref, locale) : value}</span>;
  }

  return <span className="text-sm">{String(value)}</span>;
}
