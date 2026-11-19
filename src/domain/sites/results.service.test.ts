import { describe, expect, it, vi } from "vitest";
import { ConsentRequiredError, ResultsService } from "./results.service";

/** Table → canned rows, with just the chain the service uses. */
function fakeDb(tables: Record<string, unknown>, storage = { download: vi.fn(), upload: vi.fn(), remove: vi.fn() }) {
  const from = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      single: async () => ({ data: tables[table], error: null }),
      maybeSingle: async () => ({ data: tables[table] ?? null, error: null }),
    };
    return chain;
  };
  return { db: { from, storage: { from: () => storage } } as never, storage };
}

describe("ResultsService.setPublished", () => {
  it("refuses to publish a card the client hasn't agreed to", async () => {
    for (const status of ["pending", "withdrawn"]) {
      const { db, storage } = fakeDb({
        progress_cards: { id: "k1", before_media_id: "m1", after_media_id: "m2" },
        card_consents: { status },
      });
      await expect(new ResultsService(db).setPublished("c1", "s1", "k1", true)).rejects.toBeInstanceOf(ConsentRequiredError);
      // Nothing was copied to the public bucket.
      expect(storage.upload).not.toHaveBeenCalled();
    }
  });

  it("refuses when there is no consent request at all", async () => {
    const { db } = fakeDb({ progress_cards: { id: "k1" } });
    await expect(new ResultsService(db).setPublished("c1", "s1", "k1", true)).rejects.toBeInstanceOf(ConsentRequiredError);
  });
});
