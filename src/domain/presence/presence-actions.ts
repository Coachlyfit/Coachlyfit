"use server";

import { createClient } from "@/lib/supabase/server";
import { PresenceService } from "./presence.service";

/** Fire-and-forget from the client heartbeat -- swallow errors (e.g. a
 * momentarily expired session) rather than surfacing a toast for a
 * background call the user never asked for. */
export async function touchPresenceAction(): Promise<void> {
  try {
    const supabase = await createClient();
    await new PresenceService(supabase).touch();
  } catch {
    // best-effort; next heartbeat tick will retry
  }
}
