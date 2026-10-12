"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { routing } from "@/i18n/routing";
import { MarketingService, type PageVersion } from "@/domain/marketing/marketing.service";
import {
  contentSchemas,
  settingsSchema,
  SECTION_TYPES,
  type Section,
  type SectionType,
} from "@/domain/marketing/sections.schema";
import type { PublishIssue } from "@/domain/marketing/snapshot";

// requireAdmin() fails fast; the marketing_* policies and the two RPCs
// re-check private.is_admin() and are the real boundary.

type ActionResult = { error: string } | void;

const uuid = z.string().uuid();
const typeSchema = z.enum(SECTION_TYPES as [SectionType, ...SectionType[]]);

const patchSchema = z.object({
  content_ar: z.unknown().optional(),
  content_en: z.unknown().optional(),
  settings: settingsSchema.optional(),
  is_visible: z.boolean().optional(),
});

export async function getDraftAction(pageId: string): Promise<{ error: string } | { sections: Section[] }> {
  if (!uuid.safeParse(pageId).success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    return { sections: await new MarketingService(supabase).getDraft(pageId) };
  } catch {
    return { error: "load_failed" };
  }
}

/** The editor's debounced autosave. The content is checked against the
 * section type's schema, so a draft is always renderable. No revalidatePath:
 * a draft changes nothing anyone but the editor can see. */
export async function saveSectionAction(sectionId: string, type: string, patch: unknown): Promise<ActionResult> {
  const parsedType = typeSchema.safeParse(type);
  const parsed = patchSchema.safeParse(patch);
  if (!uuid.safeParse(sectionId).success || !parsedType.success || !parsed.success) return { error: "invalid_input" };

  const content = contentSchemas[parsedType.data];
  const clean = { ...parsed.data };
  for (const key of ["content_ar", "content_en"] as const) {
    if (clean[key] === undefined) continue;
    const checked = content.safeParse(clean[key]);
    if (!checked.success) return { error: "invalid_input" };
    clean[key] = checked.data;
  }

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new MarketingService(supabase).saveSection(sectionId, clean);
  } catch {
    return { error: "save_failed" };
  }
}

export async function addSectionAction(
  pageId: string,
  type: string,
  position: number
): Promise<{ error: string } | { section: Section }> {
  const parsedType = typeSchema.safeParse(type);
  const parsedPosition = z.number().int().min(1).max(1000).safeParse(position);
  if (!uuid.safeParse(pageId).success || !parsedType.success || !parsedPosition.success) {
    return { error: "invalid_input" };
  }

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    return { section: await new MarketingService(supabase).addSection(pageId, parsedType.data, parsedPosition.data) };
  } catch {
    return { error: "add_failed" };
  }
}

export async function deleteSectionAction(sectionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(sectionId).success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new MarketingService(supabase).deleteSection(sectionId);
  } catch {
    return { error: "delete_failed" };
  }
}

export async function reorderSectionsAction(pageId: string, ids: string[]): Promise<ActionResult> {
  const parsedIds = z.array(uuid).min(1).max(100).safeParse(ids);
  if (!uuid.safeParse(pageId).success || !parsedIds.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new MarketingService(supabase).reorder(pageId, parsedIds.data);
  } catch {
    return { error: "reorder_failed" };
  }
}

/** Snapshots the draft as the new public version. `issues` comes back
 * instead when the draft can't be published, so the editor can point at the
 * section and field. */
export async function publishAction(pageId: string): Promise<{ error: string; issues?: PublishIssue[] } | void> {
  if (!uuid.safeParse(pageId).success) return { error: "invalid_input" };

  const { supabase, userId, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  let issues: PublishIssue[];
  try {
    issues = await new MarketingService(supabase).publish(pageId, userId);
  } catch {
    return { error: "publish_failed" };
  }
  if (issues.length > 0) return { error: "publish_blocked", issues };

  for (const locale of routing.locales) revalidatePath(`/${locale}`);
}

export async function listVersionsAction(pageId: string): Promise<{ error: string } | { versions: PageVersion[] }> {
  if (!uuid.safeParse(pageId).success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    return { versions: await new MarketingService(supabase).listVersions(pageId) };
  } catch {
    return { error: "load_failed" };
  }
}

/** Replaces the draft with a published version. The public page is not
 * touched until the restored draft is published again. */
export async function restoreVersionAction(versionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(versionId).success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new MarketingService(supabase).restore(versionId);
  } catch {
    return { error: "restore_failed" };
  }
}
