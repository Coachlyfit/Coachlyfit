"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { RelationshipsService } from "@/domain/relationships/relationships.service";

const respondSchema = z.object({
  relationshipId: z.string().uuid(),
  accept: z.boolean(),
  shareHistory: z.boolean(),
});

export async function respondToCoachInviteAction(
  locale: string,
  input: z.input<typeof respondSchema>
): Promise<{ error: string } | void> {
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  try {
    await new RelationshipsService(supabase).respond(
      parsed.data.relationshipId,
      parsed.data.accept,
      parsed.data.shareHistory
    );
  } catch (error) {
    // 23514 = the new coach's seat cap (private.enforce_client_cap).
    return { error: (error as { code?: string }).code === "23514" ? "coach_full" : "respond_failed" };
  }
  // Accepting changes the client's coach everywhere under /c.
  revalidatePath(`/${locale}/c`, "layout");
}
