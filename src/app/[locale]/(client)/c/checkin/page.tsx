import { createClient } from "@/lib/supabase/server";
import { ProgressService } from "@/domain/progress/progress.service";
import type { AppLocale } from "@/domain/locale";
import { CheckinStackClient } from "./checkin-stack-client";

const RECENT_CHECKINS_DAYS = 60;
const POSES = ["front", "side"] as const;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export default async function ClientCheckinPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const progress = new ProgressService(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: clientRow } = await supabase
    .from("clients")
    .select("id, coach_id, coaches(business_name)")
    .eq("profile_id", user!.id)
    .single();

  const todayIso = new Date().toISOString().slice(0, 10);

  const [existing, recentCheckins, recentPhotos] = clientRow
    ? await Promise.all([
        progress.getCheckin(clientRow.id, todayIso),
        progress.listCheckins(clientRow.id, isoDaysAgo(RECENT_CHECKINS_DAYS)),
        progress.listMedia(clientRow.id, "photo"),
      ])
    : [null, [], []];

  // listMedia is newest-first, so the first match per pose is the most
  // recent one — used as a ghost overlay for pose/alignment guidance in
  // the camera step (see review/page.tsx for the same signed-URL pattern).
  const lastByPose = Object.fromEntries(
    POSES.map((pose) => [pose, recentPhotos.find((m) => m.pose === pose)] as const)
  );
  const signed = await progress.signMediaUrls(
    POSES.map((pose) => lastByPose[pose]?.storage_path).filter((p): p is string => !!p)
  );
  const ghostPhotos = {
    front: lastByPose.front ? signed.get(lastByPose.front.storage_path) : undefined,
    side: lastByPose.side ? signed.get(lastByPose.side.storage_path) : undefined,
  };

  return (
    <CheckinStackClient
      locale={locale}
      today={todayIso}
      existing={existing}
      businessName={clientRow?.coaches?.business_name ?? ""}
      coachId={clientRow?.coach_id ?? ""}
      clientId={clientRow?.id ?? ""}
      recentCheckins={recentCheckins}
      ghostPhotos={ghostPhotos}
    />
  );
}
