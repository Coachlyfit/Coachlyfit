import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { PlatformSettingsService } from "@/domain/platform/settings.service";
import type { PlatformSettings } from "@/domain/platform/settings.schema";

/** React.cache-wrapped so the (coach)/(client) layouts, the pages they
 * render, and the marketing/signup pages that also need these flags each
 * get one shared fetch per request instead of one per call site. */
export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  const supabase = await createClient();
  return new PlatformSettingsService(supabase).getAll();
});
