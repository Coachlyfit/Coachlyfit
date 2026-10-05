import { createClient } from "@/lib/supabase/server";
import { getRequestCoachId } from "@/lib/auth/session";
import { InviteClientDialog } from "../clients/invite-client-dialog";
import { SendCheckinDialog } from "./send-checkin-dialog";

export async function HeaderActions({ locale }: { locale: string }) {
  const supabase = await createClient();
  const coachId = await getRequestCoachId();

  const [{ data: coach }, { data: clients }] = await Promise.all([
    coachId
      ? supabase
          .from("coaches")
          .select("form_templates!coaches_default_checkin_template_id_fkey(current_version_id)")
          .eq("id", coachId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("clients").select("id, display_name").eq("status", "active").order("display_name"),
  ]);

  return (
    <div className="flex flex-wrap gap-2">
      <SendCheckinDialog
        locale={locale}
        templateVersionId={coach?.form_templates?.current_version_id ?? null}
        clients={clients ?? []}
      />
      <InviteClientDialog locale={locale} />
    </div>
  );
}
