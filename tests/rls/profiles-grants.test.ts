// A signed-in user may edit the harmless columns of their own profile and
// nothing else. Before 20261023000001 the table-level UPDATE grant made
// `role` and `suspended_at` writable too (a column revoke can't undo it).
import { describe, expect, it } from "vitest";
import { createRlsUser, rlsAdmin } from "./rls-test-helpers";

async function coach(tag: string) {
  return createRlsUser(`grants-${tag}`, { role: "coach", full_name: "Grants", business_name: "Grants Gym", locale: "ar" });
}

describe("profiles column grants", () => {
  it("rejects a user promoting themselves to admin", async () => {
    const { userId, client } = await coach("role");
    const { error } = await client.from("profiles").update({ role: "admin" }).eq("id", userId);
    expect(error).not.toBeNull();
    const { data } = await rlsAdmin.from("profiles").select("role").eq("id", userId).single();
    expect(data?.role).toBe("coach");
  });

  it("rejects a user clearing or setting suspended_at", async () => {
    const { userId, client } = await coach("suspended");
    const { error } = await client.from("profiles").update({ suspended_at: null }).eq("id", userId);
    expect(error).not.toBeNull();
  });

  it("rejects a user editing their own terms acceptance", async () => {
    const { userId, client } = await coach("terms");
    const { error } = await client
      .from("profiles")
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq("id", userId);
    expect(error).not.toBeNull();
  });

  it("still lets a user edit email_notifications and full_name", async () => {
    const { userId, client } = await coach("ok");
    const { error } = await client
      .from("profiles")
      .update({ email_notifications: false, full_name: "Renamed" })
      .eq("id", userId);
    expect(error).toBeNull();
    const { data } = await rlsAdmin.from("profiles").select("email_notifications, full_name").eq("id", userId).single();
    expect(data).toEqual({ email_notifications: false, full_name: "Renamed" });
  });
});
