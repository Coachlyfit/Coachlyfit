import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatRange } from "@/components/appointments/format";
import type { AppLocale } from "@/domain/locale";

export type NextSessionData = {
  startsAt: string;
  endsAt: string;
  status: "requested" | "confirmed";
};

/** The client's next session, or an invitation to book one. Shown only when
 * the coach's plan includes scheduling. */
export async function NextSession({
  session,
  locale,
  timeZone,
}: {
  session: NextSessionData | null;
  locale: AppLocale;
  timeZone: string;
}) {
  const t = await getTranslations("appointments.client");
  const Chevron = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <Link
      href="/c/appointments"
      className="flex min-h-11 items-center gap-3 rounded-2xl bg-accent-tint px-3.5 py-3 text-start text-accent-tint-foreground"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-background text-foreground">
        <CalendarClock className="size-4.5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="truncate font-semibold">{session ? t("nextSession") : t("bookTitle")}</span>
        <span className="truncate text-sm">
          {session
            ? `${formatRange(session.startsAt, session.endsAt, locale, timeZone)}${session.status === "requested" ? ` · ${t("awaiting")}` : ""}`
            : t("bookHint")}
        </span>
      </span>
      <Chevron className="size-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}
