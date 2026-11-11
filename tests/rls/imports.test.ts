// Bulk import + undo: the imports table is tenant-scoped, one coach can't see,
// edit, delete or undo another's import, and undo removes only the rows that
// carry that import's id (never rows the coach added by hand).
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { ImportsService } from "@/domain/imports/imports.service";
import { createRlsUser } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

async function createCoach(tag: string): Promise<User> {
  return createRlsUser(`imports-coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Gym`,
    locale: "ar",
  });
}

let a: User;
let b: User;
let importId: string;

beforeAll(async () => {
  [a, b] = await Promise.all([createCoach("a"), createCoach("b")]);

  // One hand-made client (no import_id) that undo must never touch.
  const { error } = await a.client
    .from("clients")
    .insert({ coach_id: a.userId, display_name: "Hand made", email: "hand@example.com" });
  expect(error).toBeNull();

  const out = await new ImportsService(a.client).importClients(a.userId, [
    { displayName: "Imported One", email: "one@example.com" },
    { displayName: "Imported Two", phone: "01012345678" },
  ]);
  expect(out.imported).toBe(2);
  importId = out.importId!;
}, 60_000);

describe("imports table RLS", () => {
  it("the owner sees their import with the stored counts", async () => {
    const { data } = await a.client.from("imports").select("type, imported_count").eq("id", importId).single();
    expect(data).toEqual({ type: "clients", imported_count: 2 });
  });

  it("another coach can't read it", async () => {
    const { data } = await b.client.from("imports").select("id").eq("id", importId);
    expect(data).toEqual([]);
  });

  it("another coach can't update or delete it (0 rows matched)", async () => {
    const upd = await b.client.from("imports").update({ imported_count: 999 }).eq("id", importId).select("id");
    expect(upd.data).toEqual([]);
    const del = await b.client.from("imports").delete().eq("id", importId).select("id");
    expect(del.data).toEqual([]);
    const { data } = await a.client.from("imports").select("imported_count").eq("id", importId).single();
    expect(data?.imported_count).toBe(2);
  });

  it("another coach can't create an import row owned by someone else", async () => {
    const { error } = await b.client.from("imports").insert({ coach_id: a.userId, type: "clients" });
    expect(error).not.toBeNull();
  });

  it("another coach's undo removes nothing", async () => {
    expect(await new ImportsService(b.client).undo(importId)).toBeNull();
    const { count } = await a.client.from("clients").select("id", { count: "exact", head: true }).eq("import_id", importId);
    expect(count).toBe(2);
  });
});

describe("undo", () => {
  it("deletes only the rows from that import and then the import row", async () => {
    expect(await new ImportsService(a.client).undo(importId)).toBe(2);

    const { data: left } = await a.client.from("clients").select("display_name").eq("coach_id", a.userId);
    expect(left?.map((c) => c.display_name)).toEqual(["Hand made"]);

    const { data: imp } = await a.client.from("imports").select("id").eq("id", importId);
    expect(imp).toEqual([]);
  });
});
