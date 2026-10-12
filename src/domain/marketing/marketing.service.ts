import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  DEFAULT_BACKGROUND,
  emptyContent,
  sectionSchema,
  type Section,
  type SectionSettings,
  type SectionType,
} from "./sections.schema";
import { buildSnapshot, findPublishIssues, type PublishIssue } from "./snapshot";

const SECTION_COLUMNS = "id, type, position, is_visible, content_ar, content_en, settings";

export type SectionPatch = {
  content_ar?: unknown;
  content_en?: unknown;
  settings?: SectionSettings;
  is_visible?: boolean;
};

export type PageVersion = { id: string; published_at: string; author: string | null };

/** Rows that don't match their type's schema (a manual DB edit, a type whose
 * shape changed) are dropped rather than thrown on: the landing page must
 * render what it can, never fail on one bad section. */
function parseSections(rows: unknown): Section[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = sectionSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The draft lives in marketing_sections and is admin-only under RLS; the
 * public page reads the newest marketing_page_versions snapshot and nothing
 * else. Every method runs as the caller, so RLS decides what it may do. */
export class MarketingService {
  constructor(private db: SupabaseClient<Database>) {}

  /** Sections of the newest published version, in page order, hidden ones
   * included. Empty when the page was never published or can't be read. */
  async getPublished(slug: string): Promise<Section[]> {
    const { data, error } = await this.db
      .from("marketing_page_versions")
      .select("snapshot, marketing_pages!inner(slug)")
      .eq("marketing_pages.slug", slug)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return [];
    return parseSections((data.snapshot as { sections?: unknown } | null)?.sections);
  }

  async listPages(): Promise<{ id: string; slug: string }[]> {
    const { data, error } = await this.db.from("marketing_pages").select("id, slug").order("slug");
    if (error) throw error;
    return data;
  }

  async getDraft(pageId: string): Promise<Section[]> {
    const { data, error } = await this.db
      .from("marketing_sections")
      .select(SECTION_COLUMNS)
      .eq("page_id", pageId)
      .order("position");
    if (error) throw error;
    return parseSections(data);
  }

  async saveSection(id: string, patch: SectionPatch): Promise<void> {
    const { data, error } = await this.db
      .from("marketing_sections")
      .update({ ...(patch as Record<string, Json>), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    // RLS turns a write the caller isn't allowed into zero rows, not an error.
    if (data.length === 0) throw new Error("section not found");
  }

  async addSection(pageId: string, type: SectionType, position: number): Promise<Section> {
    const { data, error } = await this.db
      .from("marketing_sections")
      .insert({
        page_id: pageId,
        type,
        position,
        content_ar: emptyContent(type) as Json,
        content_en: emptyContent(type) as Json,
        settings: { background: DEFAULT_BACKGROUND[type], image_position: "side" },
      })
      .select(SECTION_COLUMNS)
      .single();
    if (error) throw error;
    return sectionSchema.parse(data);
  }

  async deleteSection(id: string): Promise<void> {
    const { error } = await this.db.from("marketing_sections").delete().eq("id", id);
    if (error) throw error;
  }

  async reorder(pageId: string, ids: string[]): Promise<void> {
    const { error } = await this.db.rpc("reorder_marketing_sections", { p_page_id: pageId, p_ids: ids });
    if (error) throw error;
  }

  /** Snapshots the draft as a new version. Returns what's stopping it instead
   * when the draft isn't publishable; nothing is written in that case. */
  async publish(pageId: string, userId: string): Promise<PublishIssue[]> {
    const draft = await this.getDraft(pageId);
    const issues = findPublishIssues(draft);
    if (issues.length > 0) return issues;

    const { error } = await this.db
      .from("marketing_page_versions")
      .insert({ page_id: pageId, published_by: userId, snapshot: buildSnapshot(draft) as Json });
    if (error) throw error;

    await this.db
      .from("marketing_pages")
      .update({ updated_at: new Date().toISOString(), updated_by: userId })
      .eq("id", pageId);
    return [];
  }

  async listVersions(pageId: string): Promise<PageVersion[]> {
    const { data, error } = await this.db
      .from("marketing_page_versions")
      .select("id, published_at, profiles(full_name)")
      .eq("page_id", pageId)
      .order("published_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data.map((v) => ({ id: v.id, published_at: v.published_at, author: v.profiles?.full_name ?? null }));
  }

  async restore(versionId: string): Promise<void> {
    const { error } = await this.db.rpc("restore_marketing_version", { p_version_id: versionId });
    if (error) throw error;
  }
}
