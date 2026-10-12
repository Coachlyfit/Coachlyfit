// Marketing CMS (20261019000001): the draft (marketing_sections) is admin
// only, a published snapshot is readable by anyone, and nobody but an admin
// can publish, reorder, restore or upload to the `marketing` bucket.
//
// Everything runs against a throwaway page, never the seeded "home" one.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

type User = { userId: string; client: SupabaseClient<Database> };

const anon = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const slug = `rls-test-${Date.now()}`;
const uploaded: string[] = [];

let coach: User;
let adminUser: User;
let clientUser: User;
let pageId: string;
let firstId: string;
let secondId: string;
let versionId: string;

const section = (position: number) => ({
  page_id: pageId,
  type: "final_cta" as const,
  position,
  content_ar: { title: `ar ${position}`, subtitle: "", cta: "" },
  content_en: { title: `en ${position}`, subtitle: "", cta: "" },
  settings: { background: "navy", image_position: "side" },
});

const upload = (client: SupabaseClient<Database>, name: string) =>
  client.storage.from("marketing").upload(name, new Blob(["x"]), { contentType: "text/plain" });

beforeAll(async () => {
  [coach, adminUser, clientUser] = await Promise.all([
    createRlsUser("cms-coach", { role: "coach", full_name: "Coach CMS", business_name: "CMS Gym", locale: "ar" }),
    createRlsUser("cms-admin", { role: "admin", full_name: "Admin CMS", locale: "ar" }),
    createRlsUser("cms-client", { role: "client", full_name: "Client CMS", locale: "ar" }),
  ]);

  const page = await adminUser.client.from("marketing_pages").insert({ slug }).select("id").single();
  if (page.error) throw page.error;
  pageId = page.data.id;

  const sections = await adminUser.client
    .from("marketing_sections")
    .insert([section(1), section(2)])
    .select("id, position")
    .order("position");
  if (sections.error) throw sections.error;
  [firstId, secondId] = sections.data.map((s) => s.id);

  const version = await adminUser.client
    .from("marketing_page_versions")
    .insert({
      page_id: pageId,
      published_by: adminUser.userId,
      snapshot: {
        sections: [
          { id: firstId, is_visible: true, ...section(1) },
          { id: secondId, is_visible: true, ...section(2) },
        ],
      },
    })
    .select("id")
    .single();
  if (version.error) throw version.error;
  versionId = version.data.id;
}, 30_000);

afterAll(async () => {
  await admin.from("marketing_pages").delete().eq("id", pageId);
  if (uploaded.length) await admin.storage.from("marketing").remove(uploaded);
});

const positions = async () => {
  const { data } = await admin.from("marketing_sections").select("id, position").eq("page_id", pageId).order("position");
  return (data ?? []).map((s) => s.id);
};

describe("marketing cms: admin", () => {
  it("reads and edits the draft", async () => {
    const update = await adminUser.client
      .from("marketing_sections")
      .update({ is_visible: false })
      .eq("id", secondId)
      .select("is_visible");
    expect(update.data).toEqual([{ is_visible: false }]);
  });

  it("reorders sections in one call", async () => {
    const result = await adminUser.client.rpc("reorder_marketing_sections", {
      p_page_id: pageId,
      p_ids: [secondId, firstId],
    });
    expect(result.error).toBeNull();
    expect(await positions()).toEqual([secondId, firstId]);
  });

  it("cannot publish a version attributed to someone else", async () => {
    const result = await adminUser.client
      .from("marketing_page_versions")
      .insert({ page_id: pageId, published_by: coach.userId, snapshot: { sections: [] } });
    expect(result.error).not.toBeNull();
  });

  it("cannot change or delete a published version", async () => {
    const update = await adminUser.client
      .from("marketing_page_versions")
      .update({ snapshot: { sections: [] } })
      .eq("id", versionId);
    expect(update.error).not.toBeNull();
    const remove = await adminUser.client.from("marketing_page_versions").delete().eq("id", versionId);
    expect(remove.error).not.toBeNull();

    const { data } = await admin.from("marketing_page_versions").select("snapshot").eq("id", versionId).single();
    expect((data?.snapshot as { sections: unknown[] }).sections).toHaveLength(2);
  });

  it("restores a version over the draft", async () => {
    const result = await adminUser.client.rpc("restore_marketing_version", { p_version_id: versionId });
    expect(result.error).toBeNull();

    const { data } = await admin
      .from("marketing_sections")
      .select("id, is_visible")
      .eq("page_id", pageId)
      .order("position");
    expect(data).toEqual([
      { id: firstId, is_visible: true },
      { id: secondId, is_visible: true },
    ]);
  });

  it("uploads to the marketing bucket", async () => {
    const name = `${slug}/admin.txt`;
    const result = await upload(adminUser.client, name);
    expect(result.error).toBeNull();
    uploaded.push(name);
  });
});

describe("marketing cms: everyone else", () => {
  it("lets anon read a page's slug and its published versions, and nothing more", async () => {
    const page = await anon.from("marketing_pages").select("id, slug").eq("slug", slug);
    expect(page.data).toEqual([{ id: pageId, slug }]);
    const hidden = await anon.from("marketing_pages").select("updated_by").eq("slug", slug);
    expect(hidden.error).not.toBeNull();

    const versions = await anon.from("marketing_page_versions").select("id").eq("page_id", pageId);
    expect(versions.data).toEqual([{ id: versionId }]);

    const draft = await anon.from("marketing_sections").select("id").eq("page_id", pageId);
    expect(draft.data ?? []).toEqual([]);
    const publish = await anon.from("marketing_page_versions").insert({ page_id: pageId, snapshot: { sections: [] } });
    expect(publish.error).not.toBeNull();
  });

  it.each([
    ["coach", () => coach],
    ["client", () => clientUser],
  ] as const)("gives a %s the published snapshot only", async (role, getUser) => {
    const { client, userId } = getUser();

    const versions = await client.from("marketing_page_versions").select("id").eq("page_id", pageId);
    expect(versions.data).toEqual([{ id: versionId }]);

    const draft = await client.from("marketing_sections").select("id").eq("page_id", pageId);
    expect(draft.data).toEqual([]);

    const insert = await client.from("marketing_sections").insert(section(3));
    expect(insert.error).not.toBeNull();
    await client.from("marketing_sections").update({ is_visible: false }).eq("id", firstId);
    await client.from("marketing_sections").delete().eq("id", firstId);
    const { data } = await admin.from("marketing_sections").select("is_visible").eq("id", firstId);
    expect(data).toEqual([{ is_visible: true }]);

    const page = await client.from("marketing_pages").insert({ slug: `${slug}-${role}` });
    expect(page.error).not.toBeNull();

    const publish = await client
      .from("marketing_page_versions")
      .insert({ page_id: pageId, published_by: userId, snapshot: { sections: [] } });
    expect(publish.error).not.toBeNull();

    const before = await positions();
    const reorder = await client.rpc("reorder_marketing_sections", { p_page_id: pageId, p_ids: [...before].reverse() });
    expect(reorder.error?.code).toBe("42501");
    const restore = await client.rpc("restore_marketing_version", { p_version_id: versionId });
    expect(restore.error?.code).toBe("42501");
    expect(await positions()).toEqual(before);

    const file = await upload(client, `${slug}/${role}.txt`);
    expect(file.error).not.toBeNull();
  });
});
