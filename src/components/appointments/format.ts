import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";

// Not in shared.tsx: that file is "use client", and server components can't
// call functions exported from a client module.

export function formatTime(iso: string, locale: AppLocale, timeZone: string): string {
  return formatDate(iso, locale, { hour: "2-digit", minute: "2-digit", timeZone });
}

/** "Sun, 18 Jan, 09:00 – 10:00" in `timeZone`. */
export function formatRange(startIso: string, endIso: string, locale: AppLocale, timeZone: string): string {
  const day = formatDate(startIso, locale, { weekday: "short", day: "numeric", month: "short", timeZone });
  return `${day}, ${formatTime(startIso, locale, timeZone)} – ${formatTime(endIso, locale, timeZone)}`;
}
