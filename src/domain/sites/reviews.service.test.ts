import { describe, expect, it } from "vitest";
import { hashToken, newToken, ReviewsService } from "./reviews.service";

describe("tokens", () => {
  it("hashes like SQL's sha256 hex", () => {
    // sha256("abc")
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("generates long, URL-safe, unique tokens", () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
  });
});

describe("ReviewsService.createRequest", () => {
  it("stores only the hash and returns the plaintext once", async () => {
    let inserted: Record<string, unknown> | null = null;
    const db = {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserted = row;
          return { error: null };
        },
      }),
    } as never;

    const { token, expiresAt } = await new ReviewsService(db).createRequest("c1", { clientId: "cl1", cardId: null });

    expect(inserted).not.toBeNull();
    const row = inserted as unknown as Record<string, unknown>;
    expect(row.token_hash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.coach_id).toBe("c1");
    const days = (expiresAt.getTime() - Date.now()) / 864e5;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
  });
});

describe("ReviewsService.setStatus", () => {
  it("updates only the status, scoped to the coach", async () => {
    const calls: unknown[] = [];
    const chain = {
      update: (v: unknown) => {
        calls.push(v);
        return chain;
      },
      eq: (col: string, val: unknown) => {
        calls.push([col, val]);
        return chain;
      },
      then: (resolve: (v: unknown) => void) => resolve({ error: null }),
    };
    await new ReviewsService({ from: () => chain } as never).setStatus("c1", "r1", "approved");
    expect(calls[0]).toEqual({ status: "approved" });
    expect(calls).toContainEqual(["coach_id", "c1"]);
  });
});
