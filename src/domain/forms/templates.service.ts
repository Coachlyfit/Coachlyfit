import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { FormField, FormKind, FormTemplateSchema } from "./schema";

type Template = Database["public"]["Tables"]["form_templates"]["Row"];
type TemplateVersion = Database["public"]["Tables"]["form_template_versions"]["Row"];

export type CreateTemplateInput = {
  kind: FormKind;
  name_ar: string;
  name_en: string;
  /** Unpublished starting content (e.g. the kind's suggested questions). */
  draft_schema?: FormTemplateSchema | null;
};

/** One row of the coach's forms list. The counts span every version of the
 * template: an assignment or a submission is pinned to a version, not to the
 * template itself. */
export type TemplateOverview = {
  id: string;
  kind: string;
  name_ar: string;
  name_en: string;
  updated_at: string;
  currentVersionId: string | null;
  /** Edits saved since the last publish (or a never-published form). */
  hasDraft: boolean;
  questions: number;
  clients: number;
  newResponses: number;
};

const OVERVIEW_SELECT =
  "id, kind, name_ar, name_en, updated_at, current_version_id, draft_schema, form_template_versions!form_template_versions_template_id_fkey(id, schema, form_assignments(client_id), form_submissions(reviewed_at))" as const;

function countQuestions(schema: unknown): number {
  const fields = (schema as { fields?: FormField[] } | null)?.fields ?? [];
  // A section is a heading, not something the client answers.
  return fields.filter((f) => f.type !== "section").length;
}

/** Templates + their immutable, versioned bodies. Editing a published
 * template always inserts a new version (enforced in the DB by a trigger
 * that rejects UPDATE/DELETE on form_template_versions) — this service just
 * never offers an update path for a version's schema. */
export class TemplatesService {
  constructor(private db: SupabaseClient<Database>) {}

  async list(): Promise<Template[]> {
    const { data, error } = await this.db
      .from("form_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  /** Non-archived templates with what the list cards show.
   * ponytail: pulls every version's schema and all assignment/submission
   * rows to count them here; move the counting into an RPC if a coach's
   * history ever makes this heavy. */
  async listOverview(): Promise<TemplateOverview[]> {
    const { data, error } = await this.db
      .from("form_templates")
      .select(OVERVIEW_SELECT)
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    return data.map((row) => {
      const versions = row.form_template_versions;
      const current = versions.find((v) => v.id === row.current_version_id);
      return {
        id: row.id,
        kind: row.kind,
        name_ar: row.name_ar,
        name_en: row.name_en,
        updated_at: row.updated_at,
        currentVersionId: row.current_version_id,
        hasDraft: row.draft_schema != null,
        questions: countQuestions(row.draft_schema ?? current?.schema),
        clients: new Set(versions.flatMap((v) => v.form_assignments.map((a) => a.client_id))).size,
        newResponses: versions.flatMap((v) => v.form_submissions).filter((s) => s.reviewed_at == null).length,
      };
    });
  }

  async get(id: string): Promise<Template | null> {
    const { data, error } = await this.db.from("form_templates").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async getVersion(versionId: string): Promise<TemplateVersion | null> {
    const { data, error } = await this.db
      .from("form_template_versions")
      .select("*")
      .eq("id", versionId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async listVersions(templateId: string): Promise<TemplateVersion[]> {
    const { data, error } = await this.db
      .from("form_template_versions")
      .select("*")
      .eq("template_id", templateId)
      .order("version", { ascending: false });
    if (error) throw error;
    return data;
  }

  async create(coachId: string, input: CreateTemplateInput): Promise<Template> {
    const { data, error } = await this.db
      .from("form_templates")
      .insert({ coach_id: coachId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Publishing always inserts a new version row and repoints
   * current_version_id — never mutates a version already in use by a
   * submission. */
  async publish(coachId: string, templateId: string, schema: FormTemplateSchema): Promise<TemplateVersion> {
    const { data: latest } = await this.db
      .from("form_template_versions")
      .select("version")
      .eq("template_id", templateId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version ?? 0) + 1;

    const { data: version, error: versionError } = await this.db
      .from("form_template_versions")
      .insert({ coach_id: coachId, template_id: templateId, version: nextVersion, schema })
      .select()
      .single();
    if (versionError) throw versionError;

    const { error: templateError } = await this.db
      .from("form_templates")
      .update({ current_version_id: version.id, draft_schema: null, updated_at: new Date().toISOString() })
      .eq("id", templateId);
    if (templateError) throw templateError;

    return version;
  }

  /** The builder's autosave: unpublished edits, kept on the template until
   * the next publish clears them. Clients never see this -- they are served
   * a version. */
  async saveDraft(id: string, schema: FormTemplateSchema): Promise<void> {
    const { error } = await this.db
      .from("form_templates")
      .update({ draft_schema: schema, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  async rename(id: string, names: { name_ar: string; name_en: string }): Promise<void> {
    const { error } = await this.db
      .from("form_templates")
      .update({ ...names, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  /** A new, unpublished template carrying the source's latest content
   * (unpublished edits win over the published version). Assignments and
   * submissions stay with the original. */
  async duplicate(coachId: string, id: string): Promise<Template> {
    const source = await this.get(id);
    if (!source) throw new Error("Template not found");
    const version = source.current_version_id ? await this.getVersion(source.current_version_id) : null;

    const { data, error } = await this.db
      .from("form_templates")
      .insert({
        coach_id: coachId,
        kind: source.kind,
        name_ar: `${source.name_ar} (نسخة)`,
        name_en: source.name_en ? `${source.name_en} (copy)` : "",
        draft_schema: source.draft_schema ?? version?.schema ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Soft delete. A published template can't be hard-deleted: its versions
   * are immutable and its assignments/submissions point at them. */
  async archive(id: string): Promise<void> {
    const { error } = await this.db
      .from("form_templates")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;

    // A deleted form must stop being the coach's default check-in, or the
    // dashboard's "send check-in" and the auto-assign cron keep sending it.
    const { error: defaultError } = await this.db
      .from("coaches")
      .update({ default_checkin_template_id: null })
      .eq("default_checkin_template_id", id);
    if (defaultError) throw defaultError;
  }
}
