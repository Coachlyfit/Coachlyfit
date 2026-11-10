import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { countQuestions, estimateTime } from "@/domain/forms/client-list";
import type { FormField } from "@/domain/forms/schema";
import type { DueForm } from "@/components/client-home/checkin-banner";

/** The pending form the client should do next: earliest due date first,
 * undated last, newest assignment breaking ties — the same order the Forms
 * tab uses (compareTodo). RLS (client_read_own) scopes it to the viewer. */
export async function nextDueForm(db: SupabaseClient<Database>, locale: AppLocale): Promise<DueForm | null> {
  const { data, error } = await db
    .from("form_assignments")
    .select(
      "id, form_template_versions(schema, form_templates!form_template_versions_template_id_fkey(name_ar, name_en))"
    )
    .eq("status", "pending")
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const version = data.form_template_versions;
  const fields = ((version?.schema as { fields?: FormField[] } | null)?.fields ?? []) as FormField[];
  const questionCount = countQuestions(fields);
  const time = estimateTime(questionCount);
  return {
    id: data.id,
    name: version?.form_templates ? pickLocale(version.form_templates, locale) : "—",
    questionCount,
    minutes: time.kind === "minutes" ? time.minutes : null,
  };
}
