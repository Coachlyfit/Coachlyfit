"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SubmissionsService } from "@/domain/forms/submissions.service";
import { buildAnswerSchema } from "@/domain/forms/derive";
import type { FormField } from "@/domain/forms/schema";

export async function submitFormAction(
  locale: string,
  assignmentId: string,
  fields: FormField[],
  answers: Record<string, unknown>
): Promise<{ error: string } | void> {
  const parsed = buildAnswerSchema({ fields }).safeParse(answers);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  // maybeSingle, not single: a confirmed client with no coach link yet
  // (invite never accepted) is an expected zero-row case, not a query
  // error to swallow — see 20260922000001_link_client_invite_on_signup.sql.
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!client) return { error: "not_linked" };

  try {
    await new SubmissionsService(supabase).submit(client.id, assignmentId, parsed.data);
  } catch {
    return { error: "submit_failed" };
  }
  // No redirect — the step flow shows its own "done" screen (receipt +
  // read status) before the client chooses to go back to the list. The
  // list itself must be fresh by the time they tap through.
  revalidatePath(`/${locale}/c/forms`);
}
