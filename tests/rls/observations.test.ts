// client_observations (structured coach notes) + the observation-images
// bucket: only the owning coach reads/writes. Clients never see notes or
// their images; another coach sees nothing. Admin has no direct policy.
import { beforeAll, describe, expect, it } from "vitest";
import { rlsAdmin as admin, createRlsUser } from "./rls-test-helpers";

const BUCKET = "observation-images";

async function createCoach(tag: string) {
  return createRlsUser(`obs-coach-${tag}`, {
    role: "coach",
    full_name: `Coach ${tag}`,
    business_name: `${tag} Fitness`,
    locale: "en",
  });
}

async function createClientOf(coachId: string, tag: string) {
  const { userId, client } = await createRlsUser(`obs-client-${tag}`, {
    role: "client",
    full_name: `Client ${tag}`,
    locale: "en",
  });
  const { data: row, error } = await admin
    .from("clients")
    .insert({ coach_id: coachId, profile_id: userId, display_name: `Client ${tag}` })
    .select("id")
    .single();
  if (error) throw error;
  return { userId, clientRowId: row.id as string, client };
}

let coachA: Awaited<ReturnType<typeof createCoach>>;
let coachB: Awaited<ReturnType<typeof createCoach>>;
let clientOfA: Awaited<ReturnType<typeof createClientOf>>;
let admin1: Awaited<ReturnType<typeof createRlsUser>>;
let noteId: string;
let imagePath: string;

beforeAll(async () => {
  [coachA, coachB] = await Promise.all([createCoach("a"), createCoach("b")]);
  clientOfA = await createClientOf(coachA.userId, "a1");
  admin1 = await createRlsUser("obs-admin", { role: "admin", full_name: "Admin", locale: "en" });
  imagePath = `${coachA.userId}/${clientOfA.clientRowId}/${crypto.randomUUID()}.png`;
}, 60_000);

describe("client_observations: structured fields + coach-only access", () => {
  it("the owning coach creates a note with every field", async () => {
    const { data, error } = await coachA.client
      .from("client_observations")
      .insert({
        coach_id: coachA.userId,
        client_id: clientOfA.clientRowId,
        title: "Knee pain after leg day",
        category: "injury_pain",
        severity: "high",
        details: "Left knee, sharp on squats.",
        linked_type: "exercise",
        linked_id: "00000000-0000-0000-0000-000000000001",
      })
      .select("id")
      .single();
    if (error) throw error;
    noteId = data.id;
  });

  it("check constraints reject a bad category, severity, link type and a half link", async () => {
    const base = { coach_id: coachA.userId, client_id: clientOfA.clientRowId, title: "x" };
    const bad = [
      { category: "nope" },
      { severity: "extreme" },
      { linked_type: "workout", linked_id: "00000000-0000-0000-0000-000000000001" },
      { linked_type: "program" },
    ];
    for (const extra of bad) {
      const { error } = await coachA.client.from("client_observations").insert({ ...base, ...extra });
      expect(error).not.toBeNull();
    }
  });

  it("the owning coach can edit the note", async () => {
    const { data, error } = await coachA.client
      .from("client_observations")
      .update({ severity: null, category: "technique" })
      .eq("id", noteId)
      .select("severity, category");
    if (error) throw error;
    expect(data).toEqual([{ severity: null, category: "technique" }]);
  });

  it("the client, another coach and an admin cannot read the note", async () => {
    for (const who of [clientOfA.client, coachB.client, admin1.client]) {
      const { data } = await who.from("client_observations").select("id").eq("id", noteId);
      expect(data).toEqual([]);
    }
  });

  it("another coach cannot update or delete it", async () => {
    const update = await coachB.client.from("client_observations").update({ title: "hacked" }).eq("id", noteId).select("id");
    expect(update.data).toEqual([]);
    const del = await coachB.client.from("client_observations").delete().eq("id", noteId).select("id");
    expect(del.data).toEqual([]);

    const { data } = await coachA.client.from("client_observations").select("title").eq("id", noteId).single();
    expect(data?.title).toBe("Knee pain after leg day");
  });

  it("another coach cannot write a note for a client that isn't theirs", async () => {
    const { error } = await coachB.client
      .from("client_observations")
      .insert({ coach_id: coachB.userId, client_id: clientOfA.clientRowId, title: "x" });
    expect(error).not.toBeNull();
  });
});

describe("observation-images bucket", () => {
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

  it("the owning coach uploads and signs an image under coach/client", async () => {
    const up = await coachA.client.storage.from(BUCKET).upload(imagePath, png, { contentType: "image/png" });
    expect(up.error).toBeNull();
    const signed = await coachA.client.storage.from(BUCKET).createSignedUrl(imagePath, 60);
    expect(signed.error).toBeNull();
  });

  it("the client, another coach and an admin cannot read it", async () => {
    for (const who of [clientOfA.client, coachB.client, admin1.client]) {
      const { error } = await who.storage.from(BUCKET).createSignedUrl(imagePath, 60);
      expect(error).not.toBeNull();
    }
  });

  it("another coach cannot upload into the first coach's folder", async () => {
    const { error } = await coachB.client.storage
      .from(BUCKET)
      .upload(`${coachA.userId}/${clientOfA.clientRowId}/${crypto.randomUUID()}.png`, png, { contentType: "image/png" });
    expect(error).not.toBeNull();
  });

  it("another coach cannot delete it (remove reports success but the file stays)", async () => {
    await coachB.client.storage.from(BUCKET).remove([imagePath]);
    const { error } = await coachA.client.storage.from(BUCKET).createSignedUrl(imagePath, 60);
    expect(error).toBeNull();
  });

  it("the owning coach can delete it", async () => {
    await coachA.client.storage.from(BUCKET).remove([imagePath]);
    const { error } = await coachA.client.storage.from(BUCKET).createSignedUrl(imagePath, 60);
    expect(error).not.toBeNull();
  });
});
