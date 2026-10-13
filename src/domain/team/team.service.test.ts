import { describe, expect, it } from "vitest";
import { TeamService } from "./team.service";

// Mirrors invites.service.test.ts's fakeSupabase style: a plain object with
// a .from(table) method returning chainable stubs, no mocking library.
function fakeSupabase(rpcResult: { data: unknown; error: unknown } = { data: null, error: null }) {
  const calls: { table: string; payload: unknown }[] = [];

  const db = {
    rpc: () => Promise.resolve(rpcResult),
    from(table: string) {
      return {
        insert: (payload: unknown) => {
          calls.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return { db: db as never, calls };
}

describe("TeamService.invite", () => {
  it("inserts a team_members row with the hashed (not plaintext) token and returns the plaintext token once", async () => {
    const { db, calls } = fakeSupabase();
    const service = new TeamService(db);

    const result = await service.invite("coach-1", "new-coach@example.com");

    expect(result.token).toMatch(/^[\w-]{20,}$/); // base64url, no padding chars

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("team_members");
    const payload = calls[0].payload as { coach_id: string; email: string; token_hash: string };
    expect(payload.coach_id).toBe("coach-1");
    expect(payload.email).toBe("new-coach@example.com");
    // The stored hash must never be the plaintext token itself.
    expect(payload.token_hash).not.toBe(result.token);
    expect(payload.token_hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });
});

describe("TeamService.seats", () => {
  it("maps the RPC row, keeping a null cap as 'no limit'", async () => {
    const capped = fakeSupabase({ data: [{ max_members: 3, used: 2, accepted: 1 }], error: null });
    expect(await new TeamService(capped.db).seats()).toEqual({ max: 3, used: 2, accepted: 1 });

    const unlimited = fakeSupabase({ data: [{ max_members: null, used: 7, accepted: 7 }], error: null });
    expect(await new TeamService(unlimited.db).seats()).toEqual({ max: null, used: 7, accepted: 7 });
  });

  it("returns null instead of throwing when there is no tenant or the RPC fails", async () => {
    expect(await new TeamService(fakeSupabase({ data: [], error: null }).db).seats()).toBeNull();
    expect(await new TeamService(fakeSupabase({ data: null, error: { code: "PGRST202" } }).db).seats()).toBeNull();
  });
});
