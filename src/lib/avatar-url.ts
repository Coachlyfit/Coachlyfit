import { AVATARS_BUCKET } from "@/domain/avatars/avatar.service";

/** Public URL for a stored avatar path (`{userId}/avatar.{ext}`), or null.
 * The bucket is public, so no signing and no Supabase client is needed —
 * which is what lets client components and plain mappers call this too. */
export function avatarPublicUrl(path: string | null | undefined): string | null {
  return path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${AVATARS_BUCKET}/${path}` : null;
}
