import { ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import { num } from "./num";

export type DueForm = {
  id: string;
  name: string;
  questionCount: number;
  /** null = under a minute. */
  minutes: number | null;
};

/** Shown only while a form is actually pending for the client. */
export async function CheckinBanner({ form, locale }: { form: DueForm; locale: AppLocale }) {
  const t = await getTranslations("client.overview");
  const count = formatNumber(form.questionCount, locale);
  const Chevron = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <Link
      href={`/c/forms/${form.id}`}
      className="flex min-h-11 items-center gap-3 rounded-2xl bg-accent-tint px-3.5 py-3 text-start text-accent-tint-foreground"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-background text-foreground">
        <ClipboardList className="size-4.5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="truncate font-semibold">{t("formDue", { name: form.name })}</span>
        <span className="text-sm">
          {form.minutes == null
            ? t.rich("bannerMetaShort", { count, num })
            : t.rich("bannerMeta", { count, minutes: formatNumber(form.minutes, locale), num })}
        </span>
      </span>
      <span className="flex h-9 shrink-0 items-center gap-1 rounded-[9px] bg-primary px-3.5 font-semibold text-primary-foreground">
        {t("start")}
        <Chevron className="size-4" aria-hidden="true" />
      </span>
    </Link>
  );
}
