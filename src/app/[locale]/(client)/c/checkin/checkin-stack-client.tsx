"use client";

import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/domain/locale";
import type { Database } from "@/lib/supabase/database.types";
import { CheckinWizard } from "./checkin-wizard";

type Checkin = Database["public"]["Tables"]["checkins"]["Row"];

/** Thin wrapper around CheckinWizard, mirroring how fill-form-client.tsx
 * wraps StepFormRenderer — the wizard owns its own intro/step/review/done
 * chrome, so this component's only job is data plumbing and post-submit
 * navigation. */
export function CheckinStackClient({
  locale,
  today,
  existing,
  businessName,
  coachId,
  clientId,
  recentCheckins,
  ghostPhotos,
}: {
  locale: AppLocale;
  today: string;
  existing: Checkin | null;
  businessName: string;
  coachId: string;
  clientId: string;
  recentCheckins: Checkin[];
  ghostPhotos: { front?: string; side?: string };
}) {
  const router = useRouter();

  return (
    // Fixed full-bleed overlay, same reasoning as the workout session runner
    // and forms/[assignmentId]/page.tsx: a guided step wizard is a bare
    // full-viewport screen, not a page meant to sit inside the (client)/c
    // layout's header/nav/max-w-lg chrome.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <CheckinWizard
        locale={locale}
        today={today}
        existing={existing}
        businessName={businessName}
        coachId={coachId}
        clientId={clientId}
        recentCheckins={recentCheckins}
        ghostPhotos={ghostPhotos}
        onDone={() => router.push("/c")}
      />
    </div>
  );
}
