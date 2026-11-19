"use client";

import type { CSSProperties, ReactNode, Ref } from "react";
import { useTranslations } from "next-intl";
import { ImageOff, Loader2 } from "lucide-react";
import type { AppLocale } from "@/domain/locale";
import type { HeroModel } from "@/domain/progress/share-stats";
import type { SharePose } from "@/domain/progress/share.service";
import { cardVars, type CardTheme } from "./card-theme";

export type CardFormat = "story" | "feed";
export type CardPhotoState = "ready" | "loading" | "missing";
export type CardCoach = {
  name: string;
  handle: string;
  logoUrl: string | null;
  primary: string | null;
  accent: string | null;
};

export const CARD_WIDTH = 1080;
export const cardHeight = (format: CardFormat) => (format === "story" ? 1920 : 1350);

type Props = {
  ref?: Ref<HTMLDivElement>;
  format: CardFormat;
  theme: CardTheme;
  locale: AppLocale;
  coach: CardCoach;
  pose: SharePose;
  beforeSrc: string | null;
  afterSrc: string | null;
  photoState: CardPhotoState;
  hero: HeroModel;
  weeks: number;
  /** null hides the adherence row. */
  adherence: number | null;
  showDuration: boolean;
  showLogo: boolean;
};

const v = (name: string) => `var(--card-${name})`;

/** The 1080px-wide share image, direction C (data-first): coach header, one
 * big number, a 12-week timeline, two equal photos, optional adherence, and
 * the handle. Fixed pixel sizes on purpose: this is an image, not a layout. */
export function ProgressShareCard({
  ref,
  format,
  theme,
  locale,
  coach,
  pose,
  beforeSrc,
  afterSrc,
  photoState,
  hero,
  weeks,
  adherence,
  showDuration,
  showLogo,
}: Props) {
  const t = useTranslations("progress.share.card");
  const tPose = useTranslations("progress.photos.pose");
  const ar = locale === "ar";
  const story = format === "story";

  // Arabic-Indic digits in Plex Sans Arabic, Latin digits in Plex Mono.
  const nf = (n: number, options?: Intl.NumberFormatOptions) =>
    n.toLocaleString(ar ? "ar-EG" : "en-US", { numberingSystem: ar ? "arab" : "latn", ...options });
  const numFont = ar ? "var(--font-sans)" : "var(--font-mono)";

  let heroValue: string;
  let heroUnit = "";
  let heroLabel = "";
  let heroSize = story ? 220 : 150;
  let heroFont = numFont;
  if (hero.kind === "weight") {
    const sign = hero.delta < 0 ? "−" : hero.delta > 0 ? "+" : "";
    heroValue = sign + nf(Math.abs(hero.delta), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    heroUnit = t("kg");
    heroLabel = hero.withDuration ? t("weightLabelIn", { count: weeks, n: nf(weeks) }) : t("weightLabel");
  } else if (hero.kind === "duration") {
    heroValue = nf(hero.weeks);
    heroUnit = t("weeksUnit", { count: hero.weeks });
    heroLabel = t("consistent");
  } else {
    heroValue = t("report");
    heroSize = story ? 110 : 84;
    heroFont = "var(--font-sans)";
  }
  const heroUnitSize = story ? 64 : 48;

  const photos = [
    { key: "before", label: t("before"), week: t("week", { n: nf(1) }), src: beforeSrc, state: photoState },
    { key: "after", label: t("after"), week: t("week", { n: nf(weeks) }), src: afterSrc, state: photoState },
  ];

  const style = {
    ...cardVars(theme, { primary: coach.primary, accent: coach.accent }),
    width: CARD_WIDTH,
    height: cardHeight(format),
    boxSizing: "border-box",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: story ? 44 : 26,
    // Story: Instagram UI covers the top and bottom 250px, so nothing sits there.
    paddingBlock: story ? "250px" : "72px 64px",
    paddingInline: 72,
    background: v("surface"),
    color: v("ink"),
    fontFamily: "var(--font-sans), system-ui, sans-serif",
  } as CSSProperties;

  return (
    <div ref={ref} dir={ar ? "rtl" : "ltr"} lang={locale} style={style}>
      {/* Header: logo tile, coach name (2-line clamp), pose chip */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {showLogo && (
          <div
            role="img"
            aria-label={t("logoAlt")}
            style={{
              width: 76,
              height: 76,
              flex: "none",
              borderRadius: 20,
              background: coach.logoUrl ? v("surface") : v("primary"),
              color: v("on-primary"),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 42,
              fontWeight: 700,
              lineHeight: 1,
              overflow: "hidden",
              boxShadow: coach.logoUrl ? `inset 0 0 0 2px ${v("line")}` : "none",
            }}
          >
            {coach.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coach.logoUrl}
                alt=""
                crossOrigin="anonymous"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              Array.from(coach.name.trim())[0]?.toUpperCase()
            )}
          </div>
        )}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 36,
            lineHeight: 1.25,
            fontWeight: 600,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {coach.name}
        </div>
        <span
          style={{
            flex: "none",
            padding: "12px 22px",
            borderRadius: 999,
            background: v("tint"),
            color: v("tint-ink"),
            fontSize: 24,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {tPose(pose)}
        </span>
      </div>

      {/* Hero number */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 20, color: v("accent") }}>
          <span
            dir="ltr"
            style={{
              fontSize: heroSize,
              lineHeight: 0.95,
              fontWeight: 600,
              fontFamily: heroFont,
              letterSpacing: "-0.02em",
            }}
          >
            {heroValue}
          </span>
          {heroUnit && (
            <span style={{ fontSize: heroUnitSize, lineHeight: 1, fontWeight: 600 }}>{heroUnit}</span>
          )}
        </div>
        {heroLabel && <div style={{ fontSize: 32, lineHeight: 1.35, color: v("muted") }}>{heroLabel}</div>}
      </div>

      {/* 12-segment week timeline */}
      {showDuration && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 8 }}>
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} style={{ height: 14, borderRadius: 4, background: v("primary") }} />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 24,
              lineHeight: 1,
              color: v("muted"),
            }}
          >
            <span>{t("week", { n: nf(1) })}</span>
            <span>{t("week", { n: nf(weeks) })}</span>
          </div>
        </div>
      )}

      {/* Two equal photos */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 20 }}>
        {photos.map((p) => (
          <div
            key={p.key}
            style={{
              flex: 1,
              minWidth: 0,
              position: "relative",
              overflow: "hidden",
              borderRadius: 24,
              background: v("photo-bg"),
            }}
          >
            {p.state === "ready" && p.src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.src}
                alt=""
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center top",
                }}
              />
            )}
            {(p.state === "loading" || (p.state === "ready" && !p.src)) && (
              <Placeholder icon={<Loader2 size={64} strokeWidth={2} />} label={t("loading")} />
            )}
            {p.state === "missing" && (
              <Placeholder
                icon={<ImageOff size={64} strokeWidth={1.75} />}
                label={t("missing")}
                dashed
              />
            )}
            <div
              style={{
                position: "absolute",
                top: 22,
                insetInlineStart: 22,
                padding: "12px 20px",
                borderRadius: 999,
                background: v("surface"),
                color: v("ink"),
                fontSize: 24,
                fontWeight: 600,
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {p.label} · {p.week}
            </div>
          </div>
        ))}
      </div>

      {/* Optional adherence */}
      {adherence != null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            padding: "24px 28px",
            borderRadius: 24,
            background: v("bg"),
            border: `2px solid ${v("line")}`,
          }}
        >
          <span
            dir="ltr"
            style={{ fontSize: 48, lineHeight: 1, fontWeight: 600, fontFamily: numFont }}
          >
            {nf(adherence)}
            {ar ? "٪" : "%"}
          </span>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 24, lineHeight: 1.2, color: v("muted") }}>{t("adherenceLabel")}</span>
            <div
              style={{
                height: 12,
                borderRadius: 999,
                background: v("line"),
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Grows from the inline start: the right edge in RTL. */}
              <div
                style={{
                  position: "absolute",
                  insetBlock: 0,
                  insetInlineStart: 0,
                  width: `${Math.min(100, Math.max(0, adherence))}%`,
                  borderRadius: 999,
                  background: v("primary"),
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Footer: handle + Coachly Fit mark */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
        <span dir="ltr" style={{ fontSize: 30, fontWeight: 500, lineHeight: 1.2 }}>
          {coach.handle}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: v("muted"), opacity: 0.85 }}>
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <path d="M24.27 8.50 A15.5 15.5 0 1 0 39.50 23.73" stroke="currentColor" strokeWidth="8" />
            <circle cx="37.44" cy="10.56" r="6" fill={v("mark-dot")} />
          </svg>
          <span style={{ fontSize: 22, fontWeight: 500, lineHeight: 1 }}>{t("made")}</span>
        </div>
      </div>
    </div>
  );
}

function Placeholder({ icon, label, dashed = false }: { icon: ReactNode; label: string; dashed?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        background: dashed ? v("bg") : v("photo-bg"),
        color: v("muted"),
        border: dashed ? `4px dashed ${v("line")}` : "none",
        borderRadius: 24,
        boxSizing: "border-box",
      }}
    >
      {icon}
      <span style={{ fontSize: 26, fontWeight: 500 }}>{label}</span>
    </div>
  );
}
