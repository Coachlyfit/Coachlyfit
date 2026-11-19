import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { defaultDraft, parseContent, publishIssues, type PublishIssue, type SiteContent } from "./site-content";

export type SiteRecord = {
  id: string;
  domain: string | null;
  domainStatus: "none" | "pending" | "connected" | "error";
  isPublished: boolean;
  draft: SiteContent;
  /** What visitors see. null until the first publish. */
  published: SiteContent | null;
  publishedAt: string | null;
  updatedAt: string;
};

/** Thrown by publish() when the draft isn't ready; `issues` says why. */
export class PublishBlockedError extends Error {
  constructor(public issues: PublishIssue[]) {
    super("publish_blocked");
  }
}

/** Never published yet, so there's nothing to switch on. */
export class NotPublishedError extends Error {
  constructor() {
    super("not_published");
  }
}

/** Another coach already uses this domain. */
export class DomainTakenError extends Error {
  constructor() {
    super("domain_taken");
  }
}

type SiteRow =Database["public"]["Tables"]["coach_sites"]["Row"];

const toRecord = (row: SiteRow): SiteRecord => ({
  id: row.id,
  domain: row.domain,
  domainStatus: row.domain_status as SiteRecord["domainStatus"],
  isPublished: row.is_published,
  draft: parseContent(row.draft),
  published: row.published_content === null ? null : parseContent(row.published_content),
  publishedAt: row.published_at,
  updatedAt: row.updated_at,
});

const asJson = (c: SiteContent) => c as unknown as Json;

export class SitesService {
  constructor(private db: SupabaseClient<Database>) {}

  /** The coach's site row, created empty on first visit. */
  async getOrCreate(coachId: string): Promise<SiteRecord> {
    const existing = await this.db.from("coach_sites").select("*").eq("coach_id", coachId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return toRecord(existing.data);

    // ignoreDuplicates: two tabs opening the page at once must not fail.
    const created = await this.db
      .from("coach_sites")
      .upsert({ coach_id: coachId, draft: asJson(defaultDraft()) }, { onConflict: "coach_id", ignoreDuplicates: true });
    if (created.error) throw created.error;

    const again = await this.db.from("coach_sites").select("*").eq("coach_id", coachId).single();
    if (again.error) throw again.error;
    return toRecord(again.data);
  }

  async saveDraft(coachId: string, content: SiteContent): Promise<void> {
    await this.getOrCreate(coachId);
    const { error } = await this.db.from("coach_sites").update({ draft: asJson(content) }).eq("coach_id", coachId);
    if (error) throw error;
  }

  /** Copies the draft to what visitors see. The first publish also turns the
   * site live; afterwards "live" stays whatever the coach set. */
  async publish(coachId: string): Promise<SiteRecord> {
    const site = await this.getOrCreate(coachId);
    const issues = publishIssues(site.draft);
    if (issues.length > 0) throw new PublishBlockedError(issues);

    const { data, error } = await this.db
      .from("coach_sites")
      .update({
        published_content: asJson(site.draft),
        published_at: new Date().toISOString(),
        ...(site.publishedAt === null ? { is_published: true } : {}),
      })
      .eq("coach_id", coachId)
      .select("*")
      .single();
    if (error) throw error;
    return toRecord(data);
  }

  /** Throws the draft away: back to what's live (or a blank draft if never published). */
  async discardDraft(coachId: string): Promise<SiteRecord> {
    const site = await this.getOrCreate(coachId);
    const { data, error } = await this.db
      .from("coach_sites")
      .update({ draft: asJson(site.published ?? defaultDraft()) })
      .eq("coach_id", coachId)
      .select("*")
      .single();
    if (error) throw error;
    return toRecord(data);
  }

  /** "Site is live". Off = visitors see the coming-soon page. */
  async setLive(coachId: string, live: boolean): Promise<void> {
    const site = await this.getOrCreate(coachId);
    if (live && site.published === null) throw new NotPublishedError();
    const { error } = await this.db.from("coach_sites").update({ is_published: live }).eq("coach_id", coachId);
    if (error) throw error;
  }

  /** Sets (or clears, with null) the custom domain. A taken domain surfaces
   * as DomainTakenError. Returns the previous domain so the caller can
   * detach it and clear its cache. */
  async setDomain(coachId: string, domain: string | null): Promise<string | null> {
    const site = await this.getOrCreate(coachId);
    const { error } = await this.db
      .from("coach_sites")
      .update({ domain, domain_status: domain ? "pending" : "none" })
      .eq("coach_id", coachId);
    if (error) {
      if (error.code === "23505") throw new DomainTakenError();
      throw error;
    }
    return site.domain;
  }

  async setDomainStatus(coachId: string, status: SiteRecord["domainStatus"]): Promise<void> {
    const { error } = await this.db.from("coach_sites").update({ domain_status: status }).eq("coach_id", coachId);
    if (error) throw error;
  }

  /** Cache keys for this coach's public site: custom domain (if any) + slug. */
  async siteKeys(coachId: string): Promise<string[]> {
    const [site, coach] = await Promise.all([
      this.db.from("coach_sites").select("domain").eq("coach_id", coachId).maybeSingle(),
      this.db.from("coaches").select("slug").eq("id", coachId).maybeSingle(),
    ]);
    return [site.data?.domain, coach.data?.slug].filter((k): k is string => !!k);
  }
}
