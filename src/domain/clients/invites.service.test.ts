import { describe, expect, it } from "vitest";
import { InvitesService, hashInviteToken } from "./invites.service";

// A minimal fake standing in for SupabaseClient — this is the payoff of
// "services take a DB client in the constructor": no real Postgres, no
// Next.js, just plain object assertions.
function fakeSupabase(clientRow: { id: string }) {
  const calls: { table: string; payload: unknown }[] = [];

  function insertResult(table: string, payload: unknown) {
    calls.push({ table, payload });
    const result = Promise.resolve({ data: null, error: null });
    return Object.assign(result, {
      select: () => ({
        single: async () => ({ data: clientRow, error: null }),
      }),
    });
  }

  const db = {
    from(table: string) {
      return { insert: (payload: unknown) => insertResult(table, payload) };
    },
  };

  return { db: db as never, calls };
}

describe("hashInviteToken", () => {
  it("matches Postgres's digest(token, 'sha256') encoding — must stay in lockstep with the SQL side", () => {
    // Same hash the handle_new_user() trigger looks up by
    // (20260922000001_link_client_invite_on_signup.sql) and the same
    // algorithm accept_invite() uses server-side. If this ever drifts,
    // every new client invite silently fails to link.
    expect(hashInviteToken("x")).toBe(
      "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881"
    );
  });
});

describe("InvitesService", () => {
  it("creates a client row and a hashed invite, returning the plaintext token once", async () => {
    const { db, calls } = fakeSupabase({ id: "client-1" });
    const service = new InvitesService(db);

    const result = await service.createInvite("coach-1", {
      displayName: "Alice",
      email: "alice@example.com",
    });

    expect(result.clientId).toBe("client-1");
    expect(result.token).toMatch(/^[\w-]{20,}$/); // base64url, no padding chars

    expect(calls[0].table).toBe("clients");
    expect(calls[0].payload).toMatchObject({ coach_id: "coach-1", display_name: "Alice" });

    expect(calls[1].table).toBe("invites");
    const invitePayload = calls[1].payload as { token_hash: string; client_id: string };
    expect(invitePayload.client_id).toBe("client-1");
    // The stored hash must never be the plaintext token itself.
    expect(invitePayload.token_hash).not.toBe(result.token);
    expect(invitePayload.token_hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("regenerateInvite issues a fresh token for the same client without touching clients", async () => {
    const { db, calls } = fakeSupabase({ id: "unused" });
    const service = new InvitesService(db);

    const { token } = await service.regenerateInvite("coach-1", "client-9");

    expect(calls).toHaveLength(1); // no clients insert this time
    expect(calls[0].table).toBe("invites");
    expect((calls[0].payload as { client_id: string }).client_id).toBe("client-9");
    expect(token).toMatch(/^[\w-]{20,}$/);
  });

  it("createInvites keeps going past a per-row failure (e.g. the client-cap trigger)", async () => {
    // 2nd client's insert().select().single() resolves { error } (Bob) —
    // the 1st and 3rd (Alice, Carol) succeed.
    let call = 0;
    const db = {
      from(table: string) {
        return {
          insert: () => {
            call++;
            const isFailingRow = table === "clients" && call === 3;
            const result = Promise.resolve({ data: null, error: null });
            return Object.assign(result, {
              select: () => ({
                // Supabase resolves { data: null, error } on failure — it
                // never rejects the promise — so this mirrors that contract
                // rather than throwing, matching what enforce_client_cap
                // actually looks like to createInvite's error check.
                single: async () =>
                  isFailingRow
                    ? { data: null, error: new Error("23514 Client limit reached") }
                    : { data: { id: `row-${call}` }, error: null },
              }),
            });
          },
        };
      },
    };
    const service = new InvitesService(db as never);

    const result = await service.createInvites("coach-1", [
      { displayName: "Alice" },
      { displayName: "Bob" },
      { displayName: "Carol" },
    ]);

    expect(result.created).toHaveLength(2);
    expect(result.created.map((c) => c.displayName)).toEqual(["Alice", "Carol"]);
    expect(result.failed).toBe(1);
  });
});
