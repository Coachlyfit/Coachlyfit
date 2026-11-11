import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { dedupeKeys, type ClientRow, type ExerciseRow, type ImportType } from "./fields";

type Db = SupabaseClient<Database>;

const CHUNK = 100;
const PAGE = 1000;

export type ImportOutcome = {
  /** null when nothing was inserted (no imports row is kept for an empty run). */
  importId: string | null;
  imported: number;
  /** Duplicates of existing rows. */
  skipped: number;
  /** Clients only: valid rows dropped because the plan's seat limit was reached. */
  overLimit: number;
  failed: number;
  /** Set when the DB refused further inserts for a plan reason; remaining
   * rows are counted as failed. */
  stopped?: "subscription_inactive" | "upgrade_required";
};

/** Maps a Postgres error from the import inserts to an i18n key under
 * `imports.errors.*`. Same triggers as clients/actions.ts capError() and
 * library/errors.ts. */
export function importErrorKey(error: unknown): string {
  const e = error as { code?: string; hint?: string } | null;
  if (e?.hint === "subscription_inactive" || e?.hint === "upgrade_required") return e.hint;
  if (e?.code === "42501") return "subscription_inactive"; // coach_access_* restrictive policy
  if (e?.code === "23514") return "client_limit_reached";
  if (e?.code === "23503") return "in_use";
  return "unknown";
}

function isPlanStop(error: unknown): error is { hint: "subscription_inactive" | "upgrade_required" } {
  const hint = (error as { hint?: string } | null)?.hint;
  return hint === "subscription_inactive" || hint === "upgrade_required";
}

/** Bulk insert with undo. Takes the coach's session client: RLS and the
 * plan triggers (seat cap, custom_library) keep applying. coach_id and
 * import_id are set here, never read from the rows. */
export class ImportsService {
  constructor(private db: Db) {}

  private async pages<T>(
    fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
  ): Promise<T[]> {
    const out: T[] = [];
    // PostgREST caps a response at 1000 rows by default; page through.
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await fetchPage(from, from + PAGE - 1);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  /** dedupeKeys() of everything the coach already has: clients (archived
   * included) by email/phone, own exercises (archived included, globals
   * excluded) by name. */
  async existingKeys(type: ImportType, coachId: string): Promise<string[]> {
    if (type === "clients") {
      const rows = await this.pages((a, b) =>
        this.db.from("clients").select("email, phone").eq("coach_id", coachId).order("id").range(a, b)
      );
      return rows.flatMap((r) => dedupeKeys("clients", { email: r.email ?? undefined, phone: r.phone ?? undefined }));
    }
    const rows = await this.pages((a, b) =>
      this.db.from("exercises").select("name_ar, name_en").eq("coach_id", coachId).order("id").range(a, b)
    );
    return rows.flatMap((r) => dedupeKeys("exercises", r));
  }

  /** Seats left on the plan, or null when unlimited. Display math only: the
   * clients_enforce_cap trigger is the enforcement. */
  async remainingClientSeats(): Promise<number | null> {
    const [{ data: sub }, { count }] = await Promise.all([
      this.db.from("subscriptions").select("subscription_tiers(max_clients)").maybeSingle(),
      this.db.from("clients").select("id", { count: "exact", head: true }).neq("status", "archived"),
    ]);
    const max = sub?.subscription_tiers?.max_clients ?? null;
    return max === null ? null : Math.max(0, max - (count ?? 0));
  }

  async importClients(coachId: string, rows: ClientRow[]): Promise<ImportOutcome> {
    const { fresh, skipped } = await this.dropExisting("clients", coachId, rows);
    const seats = await this.remainingClientSeats();
    const allowed = seats === null ? fresh : fresh.slice(0, seats);
    return this.run("clients", coachId, allowed, skipped, fresh.length - allowed.length, (importId, chunk) =>
      this.db.from("clients").insert(
        chunk.map((r) => ({
          coach_id: coachId,
          import_id: importId,
          display_name: r.displayName,
          email: r.email ?? null,
          phone: r.phone ?? null,
        }))
      )
    );
  }

  async importExercises(coachId: string, rows: ExerciseRow[]): Promise<ImportOutcome> {
    const { fresh, skipped } = await this.dropExisting("exercises", coachId, rows);
    return this.run("exercises", coachId, fresh, skipped, 0, (importId, chunk) =>
      this.db.from("exercises").insert(chunk.map((r) => ({ ...r, coach_id: coachId, import_id: importId })))
    );
  }

  /** Re-checks duplicates against the DB (the browser's preview may be stale)
   * and within the batch itself. */
  private async dropExisting<T extends ClientRow | ExerciseRow>(type: ImportType, coachId: string, rows: T[]) {
    const seen = new Set(await this.existingKeys(type, coachId));
    const fresh: T[] = [];
    let skipped = 0;
    for (const row of rows) {
      const keys = dedupeKeys(type, row);
      if (keys.some((k) => seen.has(k))) {
        skipped++;
        continue;
      }
      keys.forEach((k) => seen.add(k));
      fresh.push(row);
    }
    return { fresh, skipped };
  }

  private async run<T>(
    type: ImportType,
    coachId: string,
    rows: T[],
    duplicates: number,
    overLimit: number,
    insert: (importId: string, chunk: T[]) => PromiseLike<{ error: unknown }>
  ): Promise<ImportOutcome> {
    const skipped = duplicates + overLimit;
    if (rows.length === 0) return { importId: null, imported: 0, skipped: duplicates, overLimit, failed: 0 };

    const { data: imp, error: impError } = await this.db
      .from("imports")
      .insert({ coach_id: coachId, type })
      .select("id")
      .single();
    if (impError) throw impError;

    let imported = 0;
    let failed = 0;
    let stopped: ImportOutcome["stopped"];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      if (stopped) {
        failed += chunk.length;
        continue;
      }
      const { error } = await insert(imp.id, chunk);
      if (!error) imported += chunk.length;
      else {
        failed += chunk.length;
        // A plan refusal repeats for every later chunk; don't hammer the DB.
        if (isPlanStop(error)) stopped = error.hint;
      }
    }

    if (imported === 0) {
      await this.db.from("imports").delete().eq("id", imp.id);
      return { importId: null, imported, skipped, overLimit, failed, stopped };
    }
    await this.db
      .from("imports")
      .update({ imported_count: imported, skipped_count: skipped, failed_count: failed })
      .eq("id", imp.id);
    return { importId: imp.id, imported, skipped, overLimit, failed, stopped };
  }

  /** Deletes exactly the rows tagged with this import, then the import row.
   * RLS scopes both to the caller's tenant, so another coach's id deletes
   * nothing. Returns the number of rows removed, or null if the import isn't
   * visible. Throws (e.g. 23503) when an imported exercise is already used
   * in a program: nothing is deleted then. */
  async undo(importId: string): Promise<number | null> {
    const { data: imp, error } = await this.db.from("imports").select("id, type").eq("id", importId).maybeSingle();
    if (error) throw error;
    if (!imp) return null;

    const res =
      imp.type === "clients"
        ? await this.db.from("clients").delete().eq("import_id", importId).select("id")
        : await this.db.from("exercises").delete().eq("import_id", importId).select("id");
    if (res.error) throw res.error;

    const { error: delError } = await this.db.from("imports").delete().eq("id", importId);
    if (delError) throw delError;
    return res.data.length;
  }
}
