"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { Dumbbell, Maximize2, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { isKnownMuscleGroup } from "@/domain/library/taxonomy";
import { resolveExerciseMedia } from "@/lib/video-embed";
import { cn } from "@/lib/utils";
import { ExerciseMedia } from "../../library/exercise-card";
import { useEquipmentLabel } from "../../library/equipment-filter";

/** An exercise as the builder passes it around: the search row, the drag
 * payload and the program tree's `exercises` join all satisfy this. Only the
 * id and names are required; media/equipment are best-effort. */
export type PickedExercise = {
  id: string;
  name_ar: string;
  name_en: string;
  muscle_group?: string | null;
  equipment?: string | null;
  thumbnail_url?: string | null;
  image_url?: string | null;
  video_url?: string | null;
};

/** Translated muscle-group + equipment labels for an exercise. */
export function useExerciseMeta() {
  const tGroups = useTranslations("library.muscleGroups");
  const equipmentLabel = useEquipmentLabel();
  return (exercise: Pick<PickedExercise, "muscle_group" | "equipment">) => ({
    group: isKnownMuscleGroup(exercise.muscle_group) ? tGroups(exercise.muscle_group) : exercise.muscle_group || null,
    equipment: equipmentLabel(exercise.equipment),
  });
}

const GIF = /\.gif(\?|#|$)/i;

/** Row thumbnail. A GIF is covered by a canvas copy of its first frame (paint
 * only, never read back, so cross-origin is fine) and animates only while the
 * row is hovered/focused (`group` on the row button). Touch devices (iPad,
 * tablets: `hover: none`) can't hover, so the cover is dropped and GIFs just
 * animate. The GIF keeps animating underneath, so hover shows it mid-loop
 * rather than from frame 0. */
function RowThumb({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isGif = GIF.test(src);

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!isGif || !loaded || !img || !canvas) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")?.drawImage(img, 0, 0);
  }, [isGif, loaded, src]);

  return (
    <>
      <img
        ref={imgRef}
        src={src}
        alt=""
        width={56}
        height={56}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className="size-full object-cover"
      />
      {isGif && loaded && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 size-full bg-muted object-cover group-hover:hidden group-focus-visible:hidden [@media(hover:none)]:hidden"
        />
      )}
    </>
  );
}

/** List row: a fixed 56px thumbnail + name (2 lines) + equipment. Prefers
 * `thumbnail_url`, then falls back to the exercise's GIF/image (same order as
 * the library cards) so rows without a thumbnail still show a preview. Images
 * are `loading="lazy"`, so only rows scrolled into view fetch their GIF. */
export function ExerciseRow({
  exercise,
  locale,
  selected,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  exercise: PickedExercise;
  locale: AppLocale;
  selected: boolean;
}) {
  const meta = useExerciseMeta();
  const thumb = resolveExerciseMedia(exercise.thumbnail_url || exercise.image_url || exercise.video_url);
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg p-1.5 text-start text-sm hover:bg-muted",
        selected && "bg-primary/10 ring-2 ring-primary hover:bg-primary/10",
        className
      )}
      {...props}
    >
      <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {thumb?.kind === "image" ? (
          <RowThumb src={thumb.src} />
        ) : (
          <Dumbbell className="size-6 text-muted-foreground/40" aria-hidden="true" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="line-clamp-2 font-medium">{pickLocale(exercise, locale)}</span>
        {meta(exercise).equipment && (
          <span className="text-xs text-muted-foreground">{meta(exercise).equipment}</span>
        )}
      </span>
    </button>
  );
}

function usePrefersReducedMotion() {
  // Lazy initializer: the hero only mounts after the dialog opens, so it is
  // never server-rendered and reading matchMedia here cannot mismatch.
  const [reduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  return reduced;
}

/** The image (or GIF) with a skeleton until it loads and a placeholder if it
 * fails. When `paused`, a canvas copy of the loaded image covers the animated
 * one (drawImage only paints; it never reads pixels back, so a cross-origin
 * GIF is fine). The caller owns the aspect ratio. */
function MediaFrame({
  src,
  alt,
  paused,
  className,
}: {
  src: string;
  alt: string;
  paused: boolean;
  className?: string;
}) {
  const t = useTranslations("programs.exerciseMedia");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!paused || !loaded || !img || !canvas) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")?.drawImage(img, 0, 0);
  }, [paused, loaded, src]);

  if (failed) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 bg-white text-muted-foreground", className)}>
        <Dumbbell className="size-16 text-muted-foreground/40" aria-hidden="true" />
        <span className="text-sm">{t("loadFailed")}</span>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden bg-white", className)}>
      {!loaded && <Skeleton className="absolute inset-0 rounded-none motion-reduce:animate-none" />}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn("size-full object-contain", paused && "invisible")}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={cn("absolute inset-0 size-full bg-white object-contain", !paused && "hidden")}
      />
    </div>
  );
}

function MediaButton({ label, children, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      title={label}
      className="size-10 bg-background shadow-sm"
      {...props}
    >
      {children}
    </Button>
  );
}

/** The big media area of the add/edit dialog. `className` carries the
 * aspect ratio (square on desktop, 4:3 on mobile) so the box is reserved
 * before the image arrives. Only this component fetches the full-size media. */
export function ExerciseHero({
  exercise,
  locale,
  className,
}: {
  exercise: PickedExercise;
  locale: AppLocale;
  className?: string;
}) {
  const t = useTranslations("programs.exerciseMedia");
  const name = pickLocale(exercise, locale);
  const media = resolveExerciseMedia(exercise.image_url || exercise.video_url || exercise.thumbnail_url);
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(reduced);
  const [expanded, setExpanded] = useState(false);
  const expandRef = useRef<HTMLButtonElement>(null);

  if (media?.kind !== "image") {
    // Embeds/links keep the library's click-to-play box; no media → placeholder.
    return media ? (
      <ExerciseMedia media={media} name={name} className={cn("rounded-xl", className)} />
    ) : (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl bg-white text-muted-foreground ring-1 ring-border",
          className
        )}
      >
        <Dumbbell className="size-20 text-muted-foreground/40" aria-hidden="true" />
        <span className="text-sm">{t("noMedia")}</span>
      </div>
    );
  }

  const isGif = GIF.test(media.src);
  const PauseIcon = paused ? Play : Pause;

  return (
    <div className={cn("relative overflow-hidden rounded-xl ring-1 ring-border", className)}>
      <MediaFrame src={media.src} alt={name} paused={isGif && paused} className="size-full" />
      {isGif && (
        <span className="absolute start-3 top-3 rounded-md bg-foreground px-2 py-0.5 text-xs font-medium text-background">
          {t("gif")}
        </span>
      )}
      <span className="absolute end-3 bottom-3 flex gap-1.5">
        {isGif && (
          <MediaButton label={paused ? t("play") : t("pause")} onClick={() => setPaused((p) => !p)}>
            <PauseIcon className="size-4 fill-current" aria-hidden="true" />
          </MediaButton>
        )}
        <MediaButton ref={expandRef} label={t("expand")} onClick={() => setExpanded(true)}>
          <Maximize2 className="size-4" aria-hidden="true" />
        </MediaButton>
      </span>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          showCloseButton={false}
          finalFocus={expandRef}
          className="gap-0 overflow-hidden p-0 sm:max-w-4xl"
        >
          <DialogTitle className="sr-only">{t("lightboxTitle", { name })}</DialogTitle>
          <MediaFrame src={media.src} alt={name} paused={isGif && paused} className="h-[75dvh] w-full" />
          <span className="absolute end-3 top-3 flex gap-1.5">
            {isGif && (
              <MediaButton label={paused ? t("play") : t("pause")} onClick={() => setPaused((p) => !p)}>
                <PauseIcon className="size-4 fill-current" aria-hidden="true" />
              </MediaButton>
            )}
            <DialogClose
              render={
                <MediaButton label={t("close")}>
                  <X className="size-4" aria-hidden="true" />
                </MediaButton>
              }
            />
          </span>
        </DialogContent>
      </Dialog>
    </div>
  );
}
