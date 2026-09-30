import { describe, expect, it } from "vitest";
import { AlreadyYourClientError, RelationshipsService } from "./relationships.service";

function fakeSupabase(rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null }) {
  const calls: { op: string; args?: unknown }[] = [];

  const db = {
    from(table: string) {
      calls.push({ op: `from:${table}` });
      const chain = {
        select: (cols: string) => {
          calls.push({ op: "select", args: cols });
          return chain;
        },
        eq: (col: string, value: unknown) => {
          calls.push({ op: "eq", args: [col, value] });
          return chain;
        },
        order: async () => ({ data: [{ id: "rel-1" }], error: null }),
      };
      return chain;
    },
    async rpc(fn: string, args: unknown) {
      calls.push({ op: `rpc:${fn}`, args });
      return rpcResult;
    },
  };

  return { db: db as never, calls };
}

describe("RelationshipsService", () => {
  it("listPending reads only pending rows (RLS scopes them to the caller)", async () => {
    const { db, calls } = fakeSupabase();
    const rows = await new RelationshipsService(db).listPending();

    expect(rows).toEqual([{ id: "rel-1" }]);
    expect(calls).toContainEqual({ op: "from:coaching_relationships" });
    expect(calls).toContainEqual({ op: "eq", args: ["status", "pending"] });
  });

  it("respond passes accept + share_history to the single-transaction RPC", async () => {
    const { db, calls } = fakeSupabase();
    await new RelationshipsService(db).respond("rel-1", true, true);

    expect(calls).toEqual([
      {
        op: "rpc:respond_to_coach_invite",
        args: { p_relationship_id: "rel-1", p_accept: true, p_share_history: true },
      },
    ]);
  });

  it("respond throws the RPC error (e.g. invite already answered)", async () => {
    const { db } = fakeSupabase({ data: null, error: { message: "Invite not found." } });
    await expect(new RelationshipsService(db).respond("rel-1", false, false)).rejects.toMatchObject({
      message: "Invite not found.",
    });
  });

  it("linkExisting returns the pending relationship id, or null for an unknown email", async () => {
    expect(await new RelationshipsService(fakeSupabase({ data: "rel-9", error: null }).db).linkExisting("a@b.co")).toBe(
      "rel-9"
    );
    expect(await new RelationshipsService(fakeSupabase().db).linkExisting("a@b.co")).toBeNull();
  });

  it("linkExisting maps already_your_client to a typed error", async () => {
    const { db } = fakeSupabase({ data: null, error: { message: "already_your_client" } });
    await expect(new RelationshipsService(db).linkExisting("a@b.co")).rejects.toBeInstanceOf(AlreadyYourClientError);
  });
});
