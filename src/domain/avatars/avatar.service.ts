import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const AVATARS_BUCKET = "avatars";

/** `""` clears the stored extension -- `avatarPath()` rebuilds it. */
export type AvatarResult = {
  /** Storage path, e.g. `u1/avatar.jpg`. Null when no avatar is set. */
  path: string | null;
  /** Public URL (bucket is public), or null. */
  url: string | null;
};

const MAX_BYTES = 2 * 1024 * 1024;
const EXT = new Set(["jpg", "jpeg", "png", "webp"]);

export class AvatarError extends Error {
  constructor(public code: "invalid_file" | "upload_failed" | "update_failed") {
    super(code);
  }
}

function fileExt(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext && EXT.has(ext) ? ext : null;
}

/** Server-side avatar upload / remove. `userId` is resolved from the session
 * by the caller (a Server Action) -- never accepted from the client -- so RLS
 * plus this check is the real boundary. */
export class AvatarService {
  constructor(private db: SupabaseClient<Database>) {}

  /** Upload `file` as `{userId}/avatar.{ext}`, replacing any existing avatar
   * (old file deleted). Returns the stored path. Validates image type and the
   * 2 MB cap server-side. */
  async upload(userId: string, file: File): Promise<string> {
    const ext = fileExt(file.name);
    if (!ext) throw new AvatarError("invalid_file");
    if (file.size > MAX_BYTES) throw new AvatarError("invalid_file");

    // Existing avatar path, if any, so we can delete it once the new file is
    // in place. The new path reuses `{userId}/avatar.<ext>`; when the
    // extension is unchanged, upload() overwrites in place (no separate
    // delete needed). When it changed, we delete the old path after upload.
    const { data: profile } = await this.db
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .maybeSingle();
    const oldPath = profile?.avatar_url ?? null;
    const newPath = `${userId}/avatar.${ext}`;

    const { error } = await this.db.storage.from(AVATARS_BUCKET).upload(newPath, file, {
      upsert: true,
    });
    if (error) throw new AvatarError("upload_failed");

    if (oldPath && oldPath !== newPath) {
      // Best effort: an orphaned old file isn't fatal, but we try to clean it
      // up so replaced avatars don't linger.
      await this.db.storage.from(AVATARS_BUCKET).remove([oldPath]);
    }

    const { error: updateError } = await this.db
      .from("profiles")
      .update({ avatar_url: newPath })
      .eq("id", userId);
    if (updateError) throw new AvatarError("update_failed");

    return newPath;
  }

  /** Remove the current avatar: clear `profiles.avatar_url` and delete the
   * stored file. Idempotent -- safe to call when no avatar is set. */
  async remove(userId: string): Promise<void> {
    const { data: profile } = await this.db
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .maybeSingle();
    const oldPath = profile?.avatar_url ?? null;

    const { error } = await this.db.from("profiles").update({ avatar_url: null }).eq("id", userId);
    if (error) throw new AvatarError("update_failed");

    if (oldPath) {
      await this.db.storage.from(AVATARS_BUCKET).remove([oldPath]);
    }
  }

  /** Public URL for a stored avatar path (bucket is public). */
  avatarUrl(path: string | null): string | null {
    return path ? this.db.storage.from(AVATARS_BUCKET).getPublicUrl(path).data.publicUrl : null;
  }
}
