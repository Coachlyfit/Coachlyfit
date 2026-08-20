"use server";

import { createClient } from "@/lib/supabase/server";
import { NotificationsService } from "@/domain/notifications/notifications.service";

export async function listNotificationsAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return new NotificationsService(supabase).listRecent();
}

export async function markNotificationsReadAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await new NotificationsService(supabase).markAllRead();
}
