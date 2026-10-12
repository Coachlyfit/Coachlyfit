"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { detectLocale, type DetectedLocale } from "@/lib/detect-locale";

// Only fires when the root [locale]/layout.tsx itself throws -- no
// NextIntlClientProvider, no guarantee globals.css/fonts loaded -- so it is
// self-contained: own <html>/<body>, inline strings, inline CSS, and
// hardcoded token-equivalent colors (light + prefers-color-scheme dark).
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

const STRINGS = {
  ar: {
    title: "حصلت مشكلة عندنا",
    description: "مش ذنبك. بياناتك في أمان، جرّب تاني بعد لحظة.",
    retry: "حاول تاني",
    retrying: "بنحاول…",
    home: "الرجوع للرئيسية",
    supportTitle: "المشكلة مستمرة؟",
    supportBody: "ابعت رمز الخطأ ده للدعم عشان نوصل للمشكلة أسرع.",
    codeLabel: "رمز الخطأ",
    copy: "نسخ",
    copied: "اتنسخ",
    contactSupport: "تواصل مع الدعم",
    brand: "كوتشلي فت",
    otherLang: "English",
  },
  en: {
    title: "Something went wrong on our end",
    description: "It's not you. Your data is safe — try again in a moment.",
    retry: "Try again",
    retrying: "Retrying…",
    home: "Back to home",
    supportTitle: "Still happening?",
    supportBody: "Send this error code to support so we can find the problem faster.",
    codeLabel: "Error code",
    copy: "Copy",
    copied: "Copied",
    contactSupport: "Contact support",
    brand: "Coachlyfit",
    otherLang: "العربية",
  },
} satisfies Record<DetectedLocale, Record<string, string>>;

const CSS = `
:root{--bg:#f8fafc;--fg:#0f172a;--muted:#64748b;--card:#fff;--line:#e2e8f0;--primary:#c2410c;--on-primary:#fff;--tint:#fee2e2;--danger:#dc2626}
@media (prefers-color-scheme:dark){:root{--bg:#020617;--fg:#f8fafc;--muted:#94a3b8;--card:#0f172a;--line:#1e293b;--primary:#fb923c;--on-primary:#0f172a;--tint:#450a0a;--danger:#f87171}}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);font:14px/1.7 system-ui,"IBM Plex Sans Arabic",sans-serif}
a{color:var(--primary)}
header{display:flex;align-items:center;justify-content:space-between;padding:20px clamp(16px,4vw,48px)}
.brand{font-size:20px;font-weight:700;color:var(--fg);text-decoration:none}
.lang{height:40px;padding-inline:12px;border:1px solid var(--line);border-radius:10px;color:var(--fg);text-decoration:none;display:flex;align-items:center;font-weight:500}
main{flex:1;display:flex;align-items:center;justify-content:center;padding:24px 16px 64px}
.col{width:100%;max-width:560px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:20px}
h1{margin:0;font-size:30px;line-height:38px}
p{margin:0}
.sub{font-size:16px;color:var(--muted)}
.row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.btn{height:48px;padding-inline:22px;border:0;border-radius:11px;font:inherit;font-size:16px;font-weight:500;display:flex;align-items:center;cursor:pointer;text-decoration:none}
.btn:disabled{opacity:.6;cursor:default}
.primary{background:var(--primary);color:var(--on-primary)}
.secondary{background:var(--line);color:var(--fg)}
.box{width:100%;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;text-align:start}
.code{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:var(--bg)}
.code b{flex:1;text-align:end;font-family:ui-monospace,monospace}
.copy{height:36px;padding-inline:12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font:inherit;font-weight:500;cursor:pointer}
`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Server render has no window, so the server snapshot is `ar`.
  const locale = useSyncExternalStore<DetectedLocale>(
    () => () => {},
    () => detectLocale(window.location.pathname, document.cookie),
    () => "ar",
  );
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const t = STRINGS[locale];
  const other: DetectedLocale = locale === "ar" ? "en" : "ar";
  // Swap (or add) the locale prefix; the proxy handles anything else.
  const otherHref =
    typeof window === "undefined"
      ? `/${other}`
      : /^\/(ar|en)(\/|$)/.test(window.location.pathname)
        ? window.location.pathname.replace(/^\/(ar|en)/, `/${other}`)
        : `/${other}`;

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <head>
        <title>{t.title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{CSS}</style>
      </head>
      <body>
        <header>
          <a className="brand" href={`/${locale}`}>
            {t.brand}
          </a>
          <a className="lang" lang={other} href={otherHref}>
            {t.otherLang}
          </a>
        </header>
        <main>
          <div className="col">
            <svg viewBox="0 0 220 120" aria-hidden="true" style={{ width: "min(260px,70vw)", height: "auto" }}>
              <line x1="20" y1="104" x2="200" y2="104" stroke="var(--line)" strokeWidth="3" strokeLinecap="round" />
              <g transform="rotate(-14 110 70)">
                <rect x="34" y="66" width="152" height="8" rx="4" fill="var(--muted)" />
                <rect x="22" y="40" width="18" height="60" rx="5" fill="var(--fg)" />
                <rect x="44" y="48" width="10" height="44" rx="4" fill="var(--fg)" opacity=".8" />
                <rect x="166" y="48" width="10" height="44" rx="4" fill="var(--fg)" opacity=".8" />
                <rect x="180" y="40" width="18" height="60" rx="5" fill="var(--fg)" />
              </g>
              <circle cx="168" cy="22" r="14" fill="var(--tint)" />
              <rect x="166.5" y="13" width="3" height="11" rx="1.5" fill="var(--danger)" />
              <circle cx="168" cy="29" r="2" fill="var(--danger)" />
            </svg>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h1>{t.title}</h1>
              <p className="sub">{t.description}</p>
            </div>
            <div className="row">
              <button
                type="button"
                className="btn primary"
                disabled={retrying}
                onClick={() => {
                  setRetrying(true);
                  reset();
                }}
              >
                {retrying ? t.retrying : t.retry}
              </button>
              <a className="btn secondary" href={`/${locale}`}>
                {t.home}
              </a>
            </div>
            {(error.digest || SUPPORT_EMAIL) && (
              <div className="box">
                <b>{t.supportTitle}</b>
                <span style={{ color: "var(--muted)" }}>{t.supportBody}</span>
                {error.digest && (
                  <div className="code">
                    <span style={{ color: "var(--muted)" }}>{t.codeLabel}</span>
                    <b dir="ltr">{error.digest}</b>
                    <button
                      type="button"
                      className="copy"
                      onClick={() => {
                        navigator.clipboard.writeText(error.digest!).then(() => setCopied(true), () => {});
                      }}
                    >
                      {copied ? t.copied : t.copy}
                    </button>
                  </div>
                )}
                {SUPPORT_EMAIL && <a href={`mailto:${SUPPORT_EMAIL}`}>{t.contactSupport}</a>}
              </div>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
