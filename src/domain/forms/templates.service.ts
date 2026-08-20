import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { FormKind, FormTemplateSchema } from "./schema";

type Template = Database["public"]["Tables"]["form_templates"]["Row"];
type TemplateVersion = Database["public"]["Tables"]["form_template_versions"]["Row"];

export type CreateTemplateInput = {
  kind: FormKind;
  name_ar: string;
  name_en: string;
};

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
      .update({ current_version_id: version.id })
      .eq("id", templateId);
    if (templateError) throw templateError;

    return version;
  }
}
