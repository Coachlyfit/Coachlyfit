"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SubmissionsService } from "@/domain/forms/submissions.service";
import { buildAnswerSchema, sanitizeDraftAnswers } from "@/domain/forms/derive";
import type { FormField } from "@/domain/forms/schema";
import type { Json } from "@/lib/supabase/database.types";

const idSchema = z.string().uuid();
// Plain-text answers plus storage paths; a draft this big is a bug or abuse.
const MAX_DRAFT_BYTES = 200_000;

/** The assignment as RLS shows it to the caller (client_read_own): its pinned
 * template fields come from the DB, never from the browser — a client must not
 * be able to drop `required` by posting its own field list. */
async function loadAssignment(assignmentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("form_assignments")
    .select("id, status, client_id, form_template_versions(schema)")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!data) return null;
  const fields = ((data.form_template_versions?.schema as { fields?: FormField[] } | null)?.fields ??
    []) as FormField[];
  return { supabase, assignment: data, fields };
}

/** Autosave. Lenient on purpose (see sanitizeDraftAnswers): required-ness is
 * only enforced at submit. No revalidatePath — the list reads drafts, but it
 * refreshes on the next navigation and a revalidation per keystroke burst
 * would be wasteful. */
export async function saveDraftAction(
  assignmentId: string,
  answers: Record<string, unknown>,
  currentFieldId: string | null
): Promise<{ error: string } | void> {
  if (!idSchema.safeParse(assignmentId).success) return { error: "invalid_input" };
  if (currentFieldId !== null && (typeof currentFieldId !== "string" || currentFieldId.length > 100)) {
    return { error: "invalid_input" };
  }
  if (JSON.stringify(answers ?? {}).length > MAX_DRAFT_BYTES) return { error: "invalid_input" };

  const loaded = await loadAssignment(assignmentId);
  if (!loaded) return { error: "not_found" };
  // Nothing to resume once submitted; RLS would refuse the write anyway.
  if (loaded.assignment.status !== "pending") return;

  const clean = sanitizeDraftAnswers(loaded.fields, answers ?? {});
  const { error } = await loaded.supabase.from("form_drafts").upsert(
    {
      assignment_id: assignmentId,
      client_id: loaded.assignment.client_id,
      answers: clean as Json,
      current_field_id: currentFieldId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "assignment_id" }
  );
  if (error) return { error: "save_failed" };
}

export async function submitFormAction(
  locale: string,
  assignmentId: string,
  answers: Record<string, unknown>
): Promise<{ error: string } | void> {
  if (!idSchema.safeParse(assignmentId).success) return { error: "invalid_input" };

  const loaded = await loadAssignment(assignmentId);
  if (!loaded) return { error: "not_found" };
  const { supabase, assignment, fields } = loaded;

  // Idempotent: a double tap, retry or second tab that lands after the first
  // submission already succeeded is a success, not an error.
  if (assignment.status === "completed") {
    revalidatePath(`/${locale}/c/forms`, "layout");
    return;
  }

  const parsed = buildAnswerSchema({ fields }).safeParse(answers);
  if (!parsed.success) return { error: "invalid_input" };

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
  } catch (e) {
    // 23505 = form_submissions_assignment_id_key: two submits raced and the
    // other one won. Same outcome the client wanted.
    if ((e as { code?: string } | null)?.code !== "23505") return { error: "submit_failed" };
  }
  revalidatePath(`/${locale}/c/forms`, "layout");
}
