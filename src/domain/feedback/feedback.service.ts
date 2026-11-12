import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { FEEDBACK_BUCKET, type FeedbackKind, type FeedbackRole } from "./feedback";

type Feedback = Database["public"]["Tables"]["feedback"]["Row"];

const SIGNED_URL_SECONDS = 60 * 60;

export type NewFeedback = {
  id: string;
  authorId: string;
  authorRole: FeedbackRole;
  /** The tenant for a coach (a team member's is the owner's); null for a client. */
  coachId: string | null;
  kind: FeedbackKind;
  rating: number | null;
  body: string | null;
  screenshotPath: string | null;
};

/** Feedback from a coach or a client -- write-only for whoever submits it
 * (see the migrations' RLS comments: there's no select-own policy, only
 * submitter_insert + admin_read), so listAll() and signScreenshots() are
 * admin-only in practice. listAll() takes no author: admin_read sees every
 * row. */
export class FeedbackService {
  constructor(private db: SupabaseClient<Database>) {}

  async create(input: NewFeedback): Promise<void> {
    const { error } = await this.db.from("feedback").insert({
      id: input.id,
      author_id: input.authorId,
      author_role: input.authorRole,
      coach_id: input.coachId,
      kind: input.kind,
      rating: input.rating,
      body: input.body?.trim() || null,
      screenshot_path: input.screenshotPath,
    });
    if (error) throw error;
  }

  async listAll(): Promise<Feedback[]> {
    const { data, error } = await this.db
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  /** Signed URLs by path. A path that can't be signed is absent. */
  async signScreenshots(paths: string[]): Promise<Record<string, string>> {
    if (paths.length === 0) return {};
    const { data, error } = await this.db.storage.from(FEEDBACK_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) throw error;
    const urls: Record<string, string> = {};
    for (const item of data) {
      if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
    }
    return urls;
  }
}
