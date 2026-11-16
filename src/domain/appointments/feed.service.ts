import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;

/** The private .ics feed token of one user (coach, member or client). The
 * token is the credential in the feed URL, so only its owner can read it
 * (RLS: calendar_feed_tokens.own_all) and rotating it revokes the old URL. */
export class FeedService {
  constructor(private db: Db) {}

  async token(profileId: string): Promise<string> {
    const { data, error } = await this.db
      .from("calendar_feed_tokens")
      .select("token")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) throw error;
    return data?.token ?? this.rotate(profileId);
  }

  async rotate(profileId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const { error } = await this.db.from("calendar_feed_tokens").upsert({ profile_id: profileId, token });
    if (error) throw error;
    return token;
  }
}
