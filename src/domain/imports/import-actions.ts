"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import {
  FIELDS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseSheetUrl,
  sheetExportUrl,
  validateRows,
  type ClientRow,
  type ExerciseRow,
  type ImportType,
} from "./fields";
import { ImportsService, importErrorKey, type ImportOutcome } from "./imports.service";

// Shared by the clients page and the library page (same reasoning as
// domain/library/library-actions.ts): the wizard is one component used from
// two routes, so its actions don't live under either route.
//
// Every action re-checks auth: Server Actions are individually addressable
// POST endpoints and don't inherit a layout guard. The coach's own session
// client is used throughout -- never the service role -- so RLS and the plan
// triggers still apply, and coach_id comes from resolveCoachId(), never the
// payload.

const typeSchema = z.enum(["clients", "exercises"]);

async function session() {
  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  return coachId ? { supabase, coachId } : null;
}

export async function existingImportKeysAction(type: ImportType): Promise<{ error: string } | { keys: string[] }> {
  if (!typeSchema.safeParse(type).success) return { error: "invalid_input" };
  const s = await session();
  if (!s) return { error: "not_authenticated" };
  try {
    return { keys: await new ImportsService(s.supabase).existingKeys(type, s.coachId) };
  } catch {
    return { error: "unknown" };
  }
}

// --- Google Sheets ---------------------------------------------------------

const SHEETS_HOST = "docs.google.com";
const isAllowedHost = (h: string) => h === SHEETS_HOST || h.endsWith(".googleusercontent.com");

/** Reads a body up to `max` bytes; null if it is larger. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks)).replace(/^﻿/, "");
}

/** Fetches a Google Sheet as CSV. Only the id and gid are taken from the
 * user's link (parseSheetUrl); the URL fetched is rebuilt by us. Redirects
 * are followed by hand, at most twice, and only to docs.google.com or
 * *.googleusercontent.com (Google serves a public sheet's export from a
 * googleusercontent host; a private one redirects to accounts.google.com). */
export async function fetchGoogleSheetAction(link: string): Promise<{ error: string } | { csv: string }> {
  const s = await session();
  if (!s) return { error: "not_authenticated" };

  const parsed = typeof link === "string" && link.length <= 2048 ? parseSheetUrl(link) : null;
  if (!parsed) return { error: "invalid_url" };

  try {
    let url = sheetExportUrl(parsed);
    for (let hop = 0; hop < 3; hop++) {
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "text/csv" },
        cache: "no-store",
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        const next = location ? new URL(location, url) : null;
        if (!next || next.protocol !== "https:") return { error: "fetch_failed" };
        // Sign-in redirect = the sheet isn't shared with "Anyone with the link".
        if (next.hostname === "accounts.google.com") return { error: "sheet_not_shared" };
        if (!isAllowedHost(next.hostname)) return { error: "fetch_failed" };
        url = next.toString();
        continue;
      }

      if (res.status === 401 || res.status === 403) return { error: "sheet_not_shared" };
      if (!res.ok) return { error: "fetch_failed" };
      // An HTML body on a 200 is Google's login/permission page, not data.
      if ((res.headers.get("content-type") ?? "").includes("text/html")) return { error: "sheet_not_shared" };

      const csv = await readCapped(res, MAX_IMPORT_BYTES);
      return csv === null ? { error: "file_too_large" } : { csv };
    }
    return { error: "fetch_failed" };
  } catch {
    return { error: "fetch_failed" };
  }
}

// --- Import / undo ---------------------------------------------------------

// Field-keyed string rows straight from the browser's mapping step. They are
// untrusted: only known field keys survive, and each row goes through the
// same zod row schemas the preview used, then the DB re-checks duplicates.
const rowsSchema = z.array(z.record(z.string().max(50), z.string().max(5000))).min(1).max(MAX_IMPORT_ROWS);

export type ImportResult = { error: string } | (ImportOutcome & { total: number });

export async function importRowsAction(locale: string, type: ImportType, rows: unknown): Promise<ImportResult> {
  const t = typeSchema.safeParse(type);
  const r = rowsSchema.safeParse(rows);
  if (!t.success || !r.success) return { error: "invalid_input" };

  const s = await session();
  if (!s) return { error: "not_authenticated" };

  const allowed = new Set(FIELDS[t.data].map((f) => f.key));
  const picked = r.data.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => allowed.has(k))));

  const checked = validateRows(t.data, picked, []);
  const valid = checked.flatMap((c) => (c.ok ? [c.data] : []));
  const inFileDuplicates = checked.filter((c) => !c.ok && c.errors.includes("duplicate")).length;
  const invalid = checked.length - valid.length - inFileDuplicates;

  const service = new ImportsService(s.supabase);
  let outcome: ImportOutcome;
  try {
    outcome =
      t.data === "clients"
        ? await service.importClients(s.coachId, valid as ClientRow[])
        : await service.importExercises(s.coachId, valid as ExerciseRow[]);
  } catch (error) {
    return { error: importErrorKey(error) };
  }

  if (outcome.imported === 0 && outcome.stopped) return { error: outcome.stopped };

  revalidatePath(`/${locale}/${t.data === "clients" ? "clients" : "library"}`);
  return {
    ...outcome,
    skipped: outcome.skipped + inFileDuplicates,
    failed: outcome.failed + invalid,
    total: checked.length,
  };
}

export async function undoImportAction(locale: string, importId: string): Promise<{ error: string } | { deleted: number }> {
  if (!z.string().uuid().safeParse(importId).success) return { error: "invalid_input" };
  const s = await session();
  if (!s) return { error: "not_authenticated" };

  try {
    const deleted = await new ImportsService(s.supabase).undo(importId);
    if (deleted === null) return { error: "not_found_or_forbidden" };
    revalidatePath(`/${locale}/clients`);
    revalidatePath(`/${locale}/library`);
    return { deleted };
  } catch (error) {
    // 23503: an imported exercise is already used in a program.
    return { error: importErrorKey(error) };
  }
}
