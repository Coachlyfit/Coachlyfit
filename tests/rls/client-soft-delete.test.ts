// Client soft delete (20261120000001): a deleted client vanishes from every
// coach surface, only the owning coach can delete/restore it, and restoring
// brings everything back. The daily purge (pg_cron) isn't exercised here:
// private.purge_deleted_clients() isn't reachable through the API.
import { type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

const coachMeta = (tag: string) => ({ role: "coach", full_name: `Coach ${tag}`, business_name: `${tag} Gym`, locale: "ar" });

describe("client soft delete", () => {
  let coach: User;
  let other: User;
  let clientId: string;

  beforeAll(async () => {
    coach = await createRlsUser("softdel-coach", coachMeta("Owner"));
    other = await createRlsUser("softdel-other", coachMeta("Other"));
    const client = await coach.client
      .from("clients")
      .insert({ coach_id: coach.userId, display_name: "To delete" })
      .select("id")
      .single();
    if (client.error) throw client.error;
    clientId = client.data.id;
    const program = await coach.client
      .from("programs")
      .insert({ coach_id: coach.userId, client_id: clientId, name_ar: "P", name_en: "P" });
    if (program.error) throw program.error;
  }, 30_000);

  it("rejects another coach", async () => {
    const { error } = await other.client.rpc("soft_delete_client", { p_client_id: clientId });
    expect(error).not.toBeNull();
    expect((await coach.client.from("clients").select("id")).data).toHaveLength(1);
  });

  it("hides the client and its programs once deleted", async () => {
    const { error } = await coach.client.rpc("soft_delete_client", { p_client_id: clientId });
    expect(error).toBeNull();

    // The row is kept, only stamped.
    const row = await admin.from("clients").select("deleted_at").eq("id", clientId).single();
    expect(row.data?.deleted_at).not.toBeNull();

    expect((await coach.client.from("clients").select("id")).data).toEqual([]);
    expect((await coach.client.from("coach_client_roster").select("client_id")).data).toEqual([]);
    expect((await coach.client.from("programs").select("id").eq("client_id", clientId)).data).toEqual([]);
  });

  it("lists it under recently deleted for its coach only", async () => {
    const mine = await coach.client.rpc("list_deleted_clients");
    expect(mine.data?.map((c) => c.client_id)).toEqual([clientId]);
    expect((await other.client.rpc("list_deleted_clients")).data).toEqual([]);
  });

  it("won't let another coach restore it", async () => {
    const { error } = await other.client.rpc("restore_client", { p_client_id: clientId });
    expect(error).not.toBeNull();
  });

  it("restores everything", async () => {
    const { error } = await coach.client.rpc("restore_client", { p_client_id: clientId });
    expect(error).toBeNull();
    expect((await coach.client.from("clients").select("id")).data).toHaveLength(1);
    expect((await coach.client.from("programs").select("id").eq("client_id", clientId)).data).toHaveLength(1);
  });
});
