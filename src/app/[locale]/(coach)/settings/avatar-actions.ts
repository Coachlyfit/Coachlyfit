"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AvatarService, AvatarError } from "@/domain/avatars/avatar.service";

type ActionResult = { error: string } | { path: string };

/** Upload the caller's own avatar. `userId` comes from the session (never the
 * client), so RLS + the service's folder check is the real boundary. */
export async function uploadAvatarAction(
  locale: string,
  formData: FormData
): Promise<ActionResult> {
  const file = formData.get("avatar") as File | null;
  if (!(file instanceof File) || file.size === 0) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    const path = await new AvatarService(supabase).upload(user.id, file);
    revalidatePath(`/${locale}`, "layout");
    revalidatePath(`/${locale}/settings`);
    return { path };
  } catch (error) {
    if (error instanceof AvatarError) return { error: error.code };
    return { error: "upload_failed" };
  }
}

/** Remove the caller's own avatar. */
export async function removeAvatarAction(locale: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    await new AvatarService(supabase).remove(user.id);
    revalidatePath(`/${locale}`, "layout");
    revalidatePath(`/${locale}/settings`);
    return { path: "" };
  } catch (error) {
    if (error instanceof AvatarError) return { error: error.code };
    return { error: "upload_failed" };
  }
}
