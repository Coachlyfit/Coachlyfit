"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { ApertureSweep } from "@/components/brand/aperture-sweep";
import { CheckinForm } from "../progress/checkin-form";
import type { AppLocale } from "@/domain/locale";
import type { Database } from "@/lib/supabase/database.types";

type Checkin = Database["public"]["Tables"]["checkins"]["Row"];

export function CheckinStackClient({
  locale,
  today,
  existing,
  businessName,
  coachId,
  clientId,
}: {
  locale: AppLocale;
  today: string;
  existing: Checkin | null;
  businessName: string;
  coachId: string;
  clientId: string;
}) {
  const t = useTranslations("client.checkin");
  const router = useRouter();
  const [done, setDone] = useState(false);
  const BackIcon = locale === "ar" ? ChevronRight : ChevronLeft;

  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#0F172A] px-8 py-10 text-center text-[#E2E8F0]">
        <ApertureSweep size={104} className="text-[#E2E8F0]" />
        <div>
          <p className="text-xl font-semibold text-[#F8FAFC]">{t("doneTitle")}</p>
          <p className="mt-2.5 max-w-xs text-[13.5px] leading-relaxed text-[#94A3B8]">{t("doneBody")}</p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/c")}
          className="flex h-12 items-center rounded-[11px] border border-[#334155] px-7 text-sm font-semibold text-[#E2E8F0]"
        >
          {t("close")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-5 pt-14.5 pb-3.5">
        <button
          type="button"
          onClick={() => router.push("/c")}
          aria-label={t("backTitle")}
          className="flex size-11 -ms-3 shrink-0 items-center justify-center text-muted-foreground"
        >
          <BackIcon className="size-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{t("backTitle")}</p>
          {businessName && <p className="mt-0.5 text-xs text-muted-foreground">{businessName}</p>}
        </div>
      </div>

      <div className="flex-1 px-5 py-5">
        <CheckinForm
          locale={locale}
          today={today}
          existing={existing}
          coachId={coachId}
          clientId={clientId}
          onSubmitted={() => setDone(true)}
        />
      </div>
    </div>
  );
}
