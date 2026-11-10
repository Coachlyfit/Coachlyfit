import { createClient } from "@/lib/supabase/server";
import { pickLocale, type AppLocale } from "@/domain/locale";
import {
  compareTodo,
  countQuestions,
  draftProgress,
  dueStatus,
  estimateTime,
  streakDays,
} from "@/domain/forms/client-list";
import type { FormField } from "@/domain/forms/schema";
import { FormsListPanel, type SentItem, type TodoItem } from "./forms-list-panel";

// ponytail: newest 200 submissions feed the sent tab and the 7-day streak;
// page it if a client ever outgrows that.
const SUBMISSION_LIMIT = 200;

/** Server half of the forms list: one RLS-scoped read of the client's own
 * assignments + submissions, shaped into the serializable rows the panel
 * renders. Lives in the forms layout so the list survives navigating between
 * forms (desktop keeps it beside the open form). */
export async function FormsListData({ locale }: { locale: AppLocale }) {
  const supabase = await createClient();
  const now = new Date();

  const [{ data: assignments }, { data: submissions }, { data: drafts }] = await Promise.all([
    supabase
      .from("form_assignments")
      .select(
        "id, status, due_at, assigned_at, coaches(business_name), form_template_versions(template_id, schema, form_templates!form_template_versions_template_id_fkey(name_ar, name_en, kind))"
      )
      .order("assigned_at", { ascending: false }),
    supabase
      .from("form_submissions")
      .select("assignment_id, submitted_at, reviewed_at, form_template_versions(template_id)")
      .order("submitted_at", { ascending: false })
      .limit(SUBMISSION_LIMIT),
    // RLS (client_own_read) limits this to the viewer's own drafts.
    supabase.from("form_drafts").select("assignment_id, answers"),
  ]);

  const draftByAssignment = new Map((drafts ?? []).map((d) => [d.assignment_id, d.answers as Record<string, unknown>]));

  const submittedByTemplate = new Map<string, string[]>();
  const submissionByAssignment = new Map<string, { submittedAt: string; reviewed: boolean }>();
  for (const s of submissions ?? []) {
    submissionByAssignment.set(s.assignment_id, { submittedAt: s.submitted_at, reviewed: s.reviewed_at !== null });
    const templateId = s.form_template_versions?.template_id;
    if (templateId) submittedByTemplate.set(templateId, [...(submittedByTemplate.get(templateId) ?? []), s.submitted_at]);
  }

  const todo: { row: TodoItem; due_at: string | null; assigned_at: string }[] = [];
  const sent: SentItem[] = [];
  let coachName = "";

  for (const a of assignments ?? []) {
    const version = a.form_template_versions;
    const template = version?.form_templates;
    const fields = ((version?.schema as { fields?: FormField[] } | null)?.fields ?? []) as FormField[];
    const name = template ? pickLocale(template, locale) : "—";
    const kind = template?.kind ?? "custom";
    coachName ||= a.coaches?.business_name ?? "";

    if (a.status === "pending") {
      const questionCount = countQuestions(fields);
      todo.push({
        row: {
          id: a.id,
          name,
          kind,
          questionCount,
          time: estimateTime(questionCount),
          due: dueStatus(a.due_at, now),
          draftPct: draftByAssignment.has(a.id) ? draftProgress(fields, draftByAssignment.get(a.id)!) : null,
          streak: version ? streakDays(submittedByTemplate.get(version.template_id) ?? [], now) : null,
        },
        // Sort keys only; they stay server-side.
        due_at: a.due_at,
        assigned_at: a.assigned_at,
      });
    } else if (a.status === "completed") {
      const sub = submissionByAssignment.get(a.id);
      sent.push({ id: a.id, name, kind, submittedAt: sub?.submittedAt ?? a.assigned_at, reviewed: sub?.reviewed ?? false });
    }
  }

  todo.sort(compareTodo);
  sent.sort((x, y) => Date.parse(y.submittedAt) - Date.parse(x.submittedAt));

  return <FormsListPanel coachName={coachName} todo={todo.map((x) => x.row)} sent={sent} />;
}
