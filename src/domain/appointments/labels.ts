import type { AppLocale } from "@/domain/locale";

// Calendar apps and Google show these strings outside our UI, so they come
// from here (bilingual records, like the email templates) rather than next-intl.
const TYPE: Record<AppLocale, Record<"online" | "in_person", string>> = {
  en: { online: "Online", in_person: "In person" },
  ar: { online: "أونلاين", in_person: "حضوري" },
};

export function typeLabel(type: string, locale: AppLocale): string {
  return TYPE[locale][type === "in_person" ? "in_person" : "online"];
}

/** Event title: who the session is with + how. `viewer` is the person reading
 * the calendar: a coach sees the client's name, a client sees "Session with
 * <coach>". */
export function appointmentSummary(args: {
  locale: AppLocale;
  viewer: "coach" | "client";
  name: string | null;
  type: string;
}): string {
  const { locale, viewer, name, type } = args;
  const label = typeLabel(type, locale);
  const who = name ?? "";
  if (viewer === "coach") return who ? `${who} · ${label}` : label;
  const prefix = locale === "ar" ? "جلسة مع" : "Session with";
  return who ? `${prefix} ${who} · ${label}` : `${prefix} ${label}`;
}
