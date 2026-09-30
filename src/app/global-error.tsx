"use client";

import { useEffect } from "react";

// Only fires when the root [locale]/layout.tsx itself throws -- there's no
// locale, no NextIntlClientProvider, and no guarantee the app's fonts/CSS
// loaded, so this can't use next-intl or the shared ErrorBoundaryFallback.
// It renders its own <html>/<body> and shows both languages at once, since
// we can't know which the visitor wanted.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "4rem 1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div>
          <p style={{ fontSize: "1.125rem", fontWeight: 600 }}>Something went wrong</p>
          <p style={{ fontSize: "0.875rem", color: "#6b7280", maxWidth: "24rem" }}>
            An unexpected error occurred. Try again, or reload the page.
          </p>
        </div>
        <div dir="rtl">
          <p style={{ fontSize: "1.125rem", fontWeight: 600 }}>حدث خطأ ما</p>
          <p style={{ fontSize: "0.875rem", color: "#6b7280", maxWidth: "24rem" }}>
            حدث خطأ غير متوقع. حاول مرة أخرى، أو أعد تحميل الصفحة.
          </p>
        </div>
        <button
          onClick={reset}
          style={{
            height: "2.75rem",
            paddingInline: "1rem",
            borderRadius: "0.625rem",
            border: "none",
            background: "#0f172a",
            color: "#f8fafc",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again / حاول مرة أخرى
        </button>
      </body>
    </html>
  );
}
