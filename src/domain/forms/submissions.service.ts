import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

type Assignment = Database["public"]["Tables"]["form_assignments"]["Row"];
type Submission = Database["public"]["Tables"]["form_submissions"]["Row"];

export class SubmissionsService {
  constructor(private db: SupabaseClient<Database>) {}

  async assign(
    coachId: string,
    input: { clientId: string; templateVersionId: string; dueAt?: string }
  ): Promise<Assignment> {
    const { data, error } = await this.db
      .from("form_assignments")
      .insert({
        coach_id: coachId,
        client_id: input.clientId,
        template_version_id: input.templateVersionId,
        due_at: input.dueAt ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listAssignmentsForClient(): Promise<Assignment[]> {
    const { data, error } = await this.db
      .from("form_assignments")
      .select("*")
      .order("assigned_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async getAssignment(id: string): Promise<Assignment | null> {
    const { data, error } = await this.db.from("form_assignments").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  /** coach_id and template_version_id come from the assignment row itself,
   * not from the caller — the client submitting a form has no legitimate
   * reason to pick either, and trusting caller input for a coach-scoped
   * column is exactly the gap closed in 20260731000015 (RLS is still the
   * real boundary; this just avoids relying on it for values we can derive). */
  async submit(clientId: string, assignmentId: string, answers: Record<string, unknown>): Promise<Submission> {
    const assignment = await this.getAssignment(assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    const { data, error } = await this.db
      .from("form_submissions")
      .insert({
        coach_id: assignment.coach_id,
        client_id: clientId,
        assignment_id: assignmentId,
        template_version_id: assignment.template_version_id,
        // Validated by buildAnswerSchema (see callers) into plain
        // primitives/arrays/objects before it ever reaches here — safe to
        // treat as Json, which Record<string, unknown> isn't structurally.
        answers: answers as Json,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Most recent prior submission of this template by this client, for the
   * step flow's "vs last week" delta. Excludes the assignment being filled
   * right now — resubmitting the same assignment must not diff against
   * itself. Joins through form_template_versions since submissions are
   * pinned to a version, not the template directly. */
  async getPreviousAnswers(
    clientId: string,
    templateId: string,
    excludeAssignmentId: string
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.db
      .from("form_submissions")
      .select("answers, submitted_at, form_template_versions!inner(template_id)")
      .eq("client_id", clientId)
      .eq("form_template_versions.template_id", templateId)
      .neq("assignment_id", excludeAssignmentId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data?.answers as Record<string, unknown> | null) ?? null;
  }

  async listSubmissionsForTemplate(templateVersionIds: string[]): Promise<Submission[]> {
    const { data, error } = await this.db
      .from("form_submissions")
      .select("*")
      .in("template_version_id", templateVersionIds)
      .order("submitted_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  /** Coach-facing history list with client + form names, newest first. Both
   * filters are optional; reviewed and unreviewed rows are both returned so
   * the coach can look back at old answers. `!inner` is what lets the
   * template filter apply to the parent row instead of just nulling the join. */
  async listWithContext(filter: { clientId?: string; templateId?: string } = {}) {
    let query = this.db
      .from("form_submissions")
      .select(
        "id, client_id, submitted_at, reviewed_at, clients(display_name), form_template_versions!inner(version, form_templates!form_template_versions_template_id_fkey(name_ar, name_en))"
      )
      .order("submitted_at", { ascending: false });
    if (filter.clientId) query = query.eq("client_id", filter.clientId);
    if (filter.templateId) query = query.eq("form_template_versions.template_id", filter.templateId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async listAllSubmissions(): Promise<Submission[]> {
    const { data, error } = await this.db
      .from("form_submissions")
      .select("*")
      .order("submitted_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async getSubmission(id: string): Promise<Submission | null> {
    const { data, error } = await this.db.from("form_submissions").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  /** The only write path for a coach on form_submissions -- see
   * mark_form_submission_reviewed() in 20261005000001_form_submission_review.sql.
   * Idempotent server-side, so a double click is harmless. */
  async markReviewed(id: string): Promise<Submission> {
    const { data, error } = await this.db.rpc("mark_form_submission_reviewed", { p_submission_id: id });
    if (error) throw error;
    return data;
  }
}
