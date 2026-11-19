import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { PhotoConsentRequest } from "./photo-consent-card";

const BUCKET = "progress-media";
const SIGNED_URL_SECONDS = 60 * 60;

/** The client's open or agreed "share my before/after" requests, with signed
 * photo URLs (the client can sign their own folder). A failure shows nothing
 * rather than breaking the home page. */
export async function loadPhotoConsents(supabase: SupabaseClient<Database>): Promise<PhotoConsentRequest[]> {
  const { data, error } = await supabase.rpc("my_card_consents");
  if (error || !data || data.length === 0) return [];

  const paths = data.flatMap((r) => [r.before_path, r.after_path]);
  const signed = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  const urlOf = (path: string) => signed.data?.find((s) => s.path === path)?.signedUrl ?? null;

  return data
    .filter((r) => r.status === "pending" || r.status === "agreed")
    .map((r) => ({
      cardId: r.card_id,
      status: r.status as "pending" | "agreed",
      coachName: r.business_name,
      beforeUrl: urlOf(r.before_path),
      afterUrl: urlOf(r.after_path),
    }));
}
