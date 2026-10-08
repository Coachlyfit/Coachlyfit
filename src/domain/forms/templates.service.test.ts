import { describe, expect, it } from "vitest";
import { TemplatesService } from "./templates.service";

function fakeSupabase({ latestVersion }: { latestVersion: number | null }) {
  const inserts: { table: string; payload: unknown }[] = [];
  const updates: { table: string; payload: unknown }[] = [];

  const db = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: latestVersion === null ? null : { version: latestVersion },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return {
            select: () => ({
              single: async () => ({ data: { id: "new-1", ...(payload as object) }, error: null }),
            }),
          };
        },
        update: (payload: unknown) => {
          updates.push({ table, payload });
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };

  return { db: db as never, inserts, updates };
}

describe("TemplatesService.publish", () => {
  it("starts a brand-new template at version 1", async () => {
    const { db, inserts } = fakeSupabase({ latestVersion: null });
    await new TemplatesService(db).publish("coach-1", "template-1", { version: 1, fields: [] });

    const versionInsert = inserts.find((i) => i.table === "form_template_versions");
    expect(versionInsert?.payload).toMatchObject({ version: 1, template_id: "template-1" });
  });

  it("increments from the latest existing version", async () => {
    const { db, inserts } = fakeSupabase({ latestVersion: 3 });
    await new TemplatesService(db).publish("coach-1", "template-1", { version: 1, fields: [] });

    const versionInsert = inserts.find((i) => i.table === "form_template_versions");
    expect(versionInsert?.payload).toMatchObject({ version: 4 });
  });

  it("repoints the template's current_version_id to the new version", async () => {
    const { db, updates } = fakeSupabase({ latestVersion: 1 });
    await new TemplatesService(db).publish("coach-1", "template-1", { version: 1, fields: [] });

    const templateUpdate = updates.find((u) => u.table === "form_templates");
    expect(templateUpdate?.payload).toMatchObject({ current_version_id: "new-1", draft_schema: null });
  });
});

describe("TemplatesService.archive", () => {
  it("soft-deletes the template and clears it as the coach's default check-in", async () => {
    const updates: { table: string; payload: unknown; eq: unknown[] }[] = [];
    const db = {
      from: (table: string) => ({
        update: (payload: unknown) => ({
          eq: async (...eq: unknown[]) => {
            updates.push({ table, payload, eq });
            return { error: null };
          },
        }),
      }),
    };
    await new TemplatesService(db as never).archive("template-1");

    expect(updates[0]).toMatchObject({ table: "form_templates", eq: ["id", "template-1"] });
    expect(updates[0].payload).toHaveProperty("archived_at");
    expect(updates[1]).toEqual({
      table: "coaches",
      payload: { default_checkin_template_id: null },
      eq: ["default_checkin_template_id", "template-1"],
    });
  });
});

function overviewDb(rows: unknown[]) {
  const db = {
    from: () => ({
      select: () => ({ is: () => ({ order: async () => ({ data: rows, error: null }) }) }),
    }),
  };
  return db as never;
}

describe("TemplatesService.listOverview", () => {
  const field = (id: string, type = "text") => ({ id, type, label: { ar: id, en: id }, required: false });
  const base = { id: "t1", kind: "intake", name_ar: "أ", name_en: "A", updated_at: "2026-10-01T00:00:00Z" };

  it("counts questions, distinct clients and unreviewed submissions across versions", async () => {
    const [row] = await new TemplatesService(
      overviewDb([
        {
          ...base,
          current_version_id: "v2",
          draft_schema: null,
          form_template_versions: [
            {
              id: "v1",
              schema: { fields: [field("a")] },
              form_assignments: [{ client_id: "c1" }],
              form_submissions: [{ reviewed_at: "2026-09-01T00:00:00Z" }],
            },
            {
              id: "v2",
              schema: { fields: [field("s", "section"), field("a"), field("b")] },
              form_assignments: [{ client_id: "c1" }, { client_id: "c2" }],
              form_submissions: [{ reviewed_at: null }, { reviewed_at: null }],
            },
          ],
        },
      ])
    ).listOverview();

    expect(row).toMatchObject({ questions: 2, clients: 2, newResponses: 2, hasDraft: false, currentVersionId: "v2" });
  });

  it("counts a draft's questions over the published version's", async () => {
    const [row] = await new TemplatesService(
      overviewDb([
        {
          ...base,
          current_version_id: null,
          draft_schema: { fields: [field("a"), field("b"), field("c")] },
          form_template_versions: [],
        },
      ])
    ).listOverview();

    expect(row).toMatchObject({ questions: 3, clients: 0, newResponses: 0, hasDraft: true });
  });
});
