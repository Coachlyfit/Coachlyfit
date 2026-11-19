"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronIcon } from "./icons";

/** scrollLeft of slide `index` in a track `width` wide. Browsers report
 * negative scrollLeft in RTL, so the sign flips with the direction. */
export function slideOffset(index: number, width: number, rtl: boolean): number {
  return (rtl ? -1 : 1) * index * width;
}

/** Slide currently snapped into view. */
export function slideIndexAt(scrollLeft: number, width: number, count: number): number {
  if (width <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(Math.abs(scrollLeft) / width)));
}

const AUTOPLAY_MS = 6000;

/** Reading direction from the nearest `dir` attribute (the site root sets it). */
const isRtl = (el: HTMLElement) => (el.closest("[dir]")?.getAttribute("dir") ?? document.documentElement.dir) === "rtl";

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** One slide per view on narrow containers (native swipe + snap, prev/next,
 * dots); a plain grid on wide ones (the controls are hidden by CSS). Works
 * the same in RTL because it scrolls instead of translating.
 *
 * Autoplay is opt-in, stops for good at the first interaction, and never runs
 * with prefers-reduced-motion. */
export function Slider({
  label,
  children,
  autoplay = false,
  onInk = false,
  trackClassName = "",
}: {
  label: string;
  children: ReactNode;
  autoplay?: boolean;
  onInk?: boolean;
  trackClassName?: string;
}) {
  const t = useTranslations("site.slider");
  const slides = Children.toArray(children);
  const count = slides.length;
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [paused, setPaused] = useState(false);
  // True while the track scrolls one slide at a time (narrow container); the
  // desktop grid shows everything.
  const [stacked, setStacked] = useState(false);
  const raf = useRef(0);

  const goTo = useCallback((i: number) => {
    const el = track.current;
    if (!el || count === 0) return;
    const next = (i + count) % count;
    el.scrollTo({
      left: slideOffset(next, el.clientWidth, isRtl(el)),
      behavior: reduced() ? "auto" : "smooth",
    });
    indexRef.current = next;
    setIndex(next);
  }, [count]);

  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = track.current;
      if (!el) return;
      const i = slideIndexAt(el.scrollLeft, el.clientWidth, count);
      indexRef.current = i;
      setIndex(i);
    });
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  useEffect(() => {
    const el = track.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setStacked(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [count]);

  useEffect(() => {
    if (!autoplay || paused || count < 2 || reduced()) return;
    const id = window.setInterval(() => {
      const el = track.current;
      // Desktop shows the grid: nothing overflows, nothing to advance.
      if (!el || el.scrollWidth <= el.clientWidth + 1) return;
      goTo(indexRef.current + 1);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [autoplay, paused, count, goTo]);

  const manual = (i: number) => {
    setPaused(true);
    goTo(i);
  };
  const btn = onInk ? "cs-btn cs-btn--ghost cs-btn--round" : "cs-btn cs-btn--outline cs-btn--round";

  return (
    <div
      className="cs-slider"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onPointerDown={() => setPaused(true)}
      onFocus={() => setPaused(true)}
    >
      <div ref={track} className={`cs-track cs-track--grid ${trackClassName}`} onScroll={onScroll}>
        {slides.map((slide, i) => (
          <div
            key={i}
            className="cs-slide"
            role="group"
            aria-roledescription="slide"
            aria-label={t("goTo", { n: i + 1, total: count })}
            // Slides scrolled out of view mustn't be reachable by Tab or read out.
            inert={stacked && i !== index}
            aria-hidden={stacked && i !== index ? true : undefined}
          >
            {slide}
          </div>
        ))}
      </div>
      {count > 1 && (
        <div className="cs-controls">
          <button type="button" className={btn} aria-label={t("prev")} onClick={() => manual(index - 1)}>
            <span className="cs-flip-inv">
              <ChevronIcon />
            </span>
          </button>
          <div className="cs-dots">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                className="cs-dot"
                aria-label={t("goTo", { n: i + 1, total: count })}
                aria-current={i === index}
                onClick={() => manual(i)}
              >
                <span />
              </button>
            ))}
          </div>
          <button type="button" className={btn} aria-label={t("next")} onClick={() => manual(index + 1)}>
            <span className="cs-flip">
              <ChevronIcon />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
