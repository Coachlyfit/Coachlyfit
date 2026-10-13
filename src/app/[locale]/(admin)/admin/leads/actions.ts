"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { LeadsService, type LeadInput } from "@/domain/leads/leads.service";
import { importSchema, leadIdSchema, leadSchema, leadStatusSchema, type LeadFormInput } from "./schemas";

type ActionResult = { error: string } | void;

// requireAdmin() fails fast; the admin_all policy on `leads` is the real boundary.

function toInput(form: LeadFormInput): LeadInput {
  return {
    email: form.email,
    fullName: form.fullName || null,
    source: form.source || null,
    locale: form.locale,
    notes: form.notes || null,
  };
}

/** 23505 is the unique index on `email`: that address is already a lead. */
function saveError(err: unknown): string {
  return (err as { code?: string } | null)?.code === "23505" ? "duplicate_email" : "save_failed";
}

function revalidate(locale: string) {
  revalidatePath(`/${locale}/admin/leads`);
  revalidatePath(`/${locale}/admin/emails`);
}

export async function createLeadAction(locale: string, input: unknown): Promise<ActionResult> {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new LeadsService(supabase).create(toInput(parsed.data));
  } catch (err) {
    return { error: saveError(err) };
  }
  revalidate(locale);
}

export async function updateLeadAction(locale: string, id: string, input: unknown): Promise<ActionResult> {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success || !leadIdSchema.safeParse(id).success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new LeadsService(supabase).update(id, toInput(parsed.data));
  } catch (err) {
    return { error: saveError(err) };
  }
  revalidate(locale);
}

export async function setLeadStatusAction(locale: string, id: string, status: string): Promise<ActionResult> {
  const parsed = leadStatusSchema.safeParse(status);
  if (!parsed.success || !leadIdSchema.safeParse(id).success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new LeadsService(supabase).setStatus(id, parsed.data);
  } catch {
    return { error: "save_failed" };
  }
  revalidate(locale);
}

export async function deleteLeadAction(locale: string, id: string): Promise<ActionResult> {
  if (!leadIdSchema.safeParse(id).success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  try {
    await new LeadsService(supabase).remove(id);
  } catch {
    return { error: "save_failed" };
  }
  revalidate(locale);
}

/** Adds the rows whose address is not a lead yet. `skipped` counts the ones
 * that already were. */
export async function importLeadsAction(
  locale: string,
  rows: unknown
): Promise<{ error: string } | { added: number; skipped: number }> {
  const parsed = importSchema.safeParse(rows);
  if (!parsed.success) return { error: "invalid_input" };

  const { supabase, error } = await requireAdmin();
  if (error || !supabase) return { error: error ?? "forbidden" };

  // Postgres refuses an upsert that names the same address twice.
  const unique = [...new Map(parsed.data.map((row) => [row.email, row])).values()];
  let added: number;
  try {
    added = await new LeadsService(supabase).importMany(unique);
  } catch {
    return { error: "save_failed" };
  }
  revalidate(locale);
  return { added, skipped: parsed.data.length - added };
}
