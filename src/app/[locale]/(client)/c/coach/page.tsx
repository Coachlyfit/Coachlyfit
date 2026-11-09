import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AVATARS_BUCKET } from "@/domain/avatars/avatar.service";
import { MessageThread } from "@/components/messages/message-thread";
import type { AppLocale } from "@/domain/locale";

export default async function ClientCoachPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("nav");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: clientRow } = await supabase
    .from("clients")
    .select("id, coach_id, coaches(business_name)")
    .eq("profile_id", user!.id)
    .single();

  // Viewer (client) avatar.
  let viewerAvatarUrl: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    viewerAvatarUrl = profile?.avatar_url
      ? supabase.storage.from(AVATARS_BUCKET).getPublicUrl(profile.avatar_url).data.publicUrl
      : null;
  }

  // Coach avatar: fetch the coach's profile avatar_url.
  let coachAvatarUrl: string | null = null;
  if (clientRow?.coach_id) {
    const coachId = clientRow.coach_id;
    const { data: coachProfile } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", coachId)
      .maybeSingle();
    coachAvatarUrl = coachProfile?.avatar_url
      ? supabase.storage.from(AVATARS_BUCKET).getPublicUrl(coachProfile.avatar_url).data.publicUrl
      : null;
  }

  return (
    <div className="flex h-[calc(100dvh-9rem-var(--bottom-nav-h))] flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        {clientRow?.coaches?.business_name ?? t("coach")}
      </h1>
      {clientRow && (
        <MessageThread
          clientId={clientRow.id}
          viewerRole="client"
          locale={locale}
          viewerAvatarUrl={viewerAvatarUrl}
          otherAvatarUrl={coachAvatarUrl}
          className="overflow-hidden rounded-xl border border-border"
        />
      )}
    </div>
  );
}
