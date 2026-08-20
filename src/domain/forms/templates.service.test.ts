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
    expect(templateUpdate?.payload).toMatchObject({ current_version_id: "new-1" });
  });
});
