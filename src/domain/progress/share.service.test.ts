import { describe, expect, it } from "vitest";
import { ShareProgressService } from "./share.service";

type Row = Record<string, unknown>;

/** Hand-rolled chain: records filters, answers `maybeSingle` with the first
 * (ascending) or last (descending) of the media rows, and signs every path. */
function fakeSupabase(opts: { media: Row[]; checkins?: Row[]; signed?: Record<string, string> }) {
  const eqCalls: { column: string; value: unknown }[] = [];
  const rangeCalls: { op: string; column: string; value: unknown }[] = [];

  function chain(rows: Row[]) {
    let ascending = true;
    const self: Record<string, unknown> = {
      eq: (column: string, value: unknown) => {
        eqCalls.push({ column, value });
        return self;
      },
      in: () => self,
      gte: (column: string, value: unknown) => {
        rangeCalls.push({ op: "gte", column, value });
        return self;
      },
      lte: (column: string, value: unknown) => {
        rangeCalls.push({ op: "lte", column, value });
        return self;
      },
      order: (_c: string, o?: { ascending?: boolean }) => {
        ascending = o?.ascending ?? true;
        return self;
      },
      limit: () => self,
      maybeSingle: async () => ({
        data: (ascending ? rows[0] : rows[rows.length - 1]) ?? null,
        error: null,
      }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
    };
    return self;
  }

  const db = {
    from: (table: string) => ({
      select: () => chain(table === "media" ? opts.media : (opts.checkins ?? [])),
    }),
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((p) => ({ path: p, error: null, signedUrl: opts.signed?.[p] ?? `https://signed/${p}` })),
          error: null,
        }),
      }),
    },
  };
  return { db: db as never, eqCalls, rangeCalls };
}

const photo = (id: string, created_at: string, pose = "front") => ({
  id,
  pose,
  storage_path: `c/k/${id}.jpg`,
  created_at,
});

describe("ShareProgressService.poseCounts", () => {
  it("counts photos per pose", async () => {
    const { db } = fakeSupabase({ media: [{ pose: "front" }, { pose: "front" }, { pose: "back" }] });
    expect(await new ShareProgressService(db).poseCounts("k")).toEqual({ front: 2, side: 0, back: 1 });
  });
});

describe("ShareProgressService.photoPair", () => {
  it("returns oldest and newest signed, scoped to client, photo kind and pose", async () => {
    const { db, eqCalls } = fakeSupabase({
      media: [photo("a", "2026-01-01T00:00:00Z"), photo("m", "2026-02-01T00:00:00Z"), photo("b", "2026-03-26T00:00:00Z")],
    });
    const pair = await new ShareProgressService(db).photoPair("k", "front");
    expect(pair?.before.id).toBe("a");
    expect(pair?.after.id).toBe("b");
    expect(pair?.after.url).toBe("https://signed/c/k/b.jpg");
    expect(pair?.weeks).toBe(12);
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        { column: "client_id", value: "k" },
        { column: "kind", value: "photo" },
        { column: "pose", value: "front" },
      ])
    );
  });

  it("is null with a single photo (oldest === newest)", async () => {
    const { db } = fakeSupabase({ media: [photo("a", "2026-01-01T00:00:00Z")] });
    expect(await new ShareProgressService(db).photoPair("k", "front")).toBeNull();
  });

  it("is null with no photos", async () => {
    const { db } = fakeSupabase({ media: [] });
    expect(await new ShareProgressService(db).photoPair("k", "side")).toBeNull();
  });
});

describe("ShareProgressService.windowStats", () => {
  it("bounds check-ins to the photo days and derives weight change + adherence", async () => {
    const { db, rangeCalls } = fakeSupabase({
      media: [],
      checkins: [
        { checkin_date: "2026-01-02", weight: 90, adherence: 80 },
        { checkin_date: "2026-03-20", weight: 81.6, adherence: 100 },
      ],
    });
    const stats = await new ShareProgressService(db).windowStats("k", "2026-01-01T09:00:00Z", "2026-03-25T09:00:00Z");
    expect(stats).toEqual({ weightDelta: -8.4, adherence: 90 });
    expect(rangeCalls).toEqual([
      { op: "gte", column: "checkin_date", value: "2026-01-01" },
      { op: "lte", column: "checkin_date", value: "2026-03-25" },
    ]);
  });
});
