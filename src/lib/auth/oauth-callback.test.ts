import { describe, expect, it } from "vitest";
import {
  handleOAuthCallback,
  oauthIntentSchema,
  type OAuthCallbackDeps,
  type OAuthIntent,
  type OAuthProfile,
  type OAuthUser,
} from "./oauth-callback";

const NOW = Date.parse("2026-11-23T12:00:00Z");
const TOKEN = "invite-token-123";

const freshUser: OAuthUser = {
  id: "u1",
  created_at: new Date(NOW - 5_000).toISOString(),
  identities: [{ provider: "google" }],
};
const oldUser: OAuthUser = { ...freshUser, created_at: new Date(NOW - 86_400_000).toISOString() };
const freshProfile: OAuthProfile = { role: "coach", suspended_at: null, terms_accepted_at: null };
const doneProfile: OAuthProfile = { role: "coach", suspended_at: null, terms_accepted_at: "2026-10-01" };

type Opts = {
  user?: OAuthUser | null;
  profile?: OAuthProfile | null;
  exchangeError?: unknown;
  signups?: boolean;
  finalizeError?: unknown;
  teamError?: { hint?: string } | null;
};

function setup(o: Opts = {}) {
  const calls: string[] = [];
  const finalizeArgs: unknown[] = [];
  const deps: OAuthCallbackDeps = {
    exchangeCode: async () => ({ error: o.exchangeError ?? null }),
    getUser: async () => (o.user === undefined ? freshUser : o.user),
    getProfile: async () => (o.profile === undefined ? freshProfile : o.profile),
    signupsEnabled: async () => o.signups ?? true,
    finalize: async (args) => {
      calls.push("finalize");
      finalizeArgs.push(args);
      return { error: o.finalizeError ?? null };
    },
    acceptTeamInvite: async () => {
      calls.push("acceptTeam");
      return { error: o.teamError ?? null };
    },
    deleteUser: async (id) => {
      calls.push(`delete:${id}`);
      return { error: null };
    },
    signOut: async () => {
      calls.push("signOut");
    },
    now: () => NOW,
  };
  return { deps, calls, finalizeArgs };
}

const intent = (over: Partial<OAuthIntent> = {}): OAuthIntent => ({
  intent: "login",
  locale: "ar",
  ...over,
});
const run = (i: OAuthIntent | null, o: Opts = {}, input: { code?: string | null; providerError?: string | null } = {}) => {
  const s = setup(o);
  const path = handleOAuthCallback(
    { code: input.code === undefined ? "code" : input.code, providerError: input.providerError ?? null, intent: i },
    s.deps
  );
  return path.then((p) => ({ path: p, ...s }));
};

describe("provider / exchange errors", () => {
  it("maps a cancelled consent screen to oauth_cancelled on the originating page", async () => {
    const r = await run(intent({ intent: "signup", locale: "en" }), {}, { providerError: "access_denied" });
    expect(r.path).toBe("/en/signup?error=oauth_cancelled");
    expect(r.calls).toEqual([]);
  });

  it("maps other provider errors to oauth_failed", async () => {
    expect((await run(intent(), {}, { providerError: "server_error" })).path).toBe("/ar/login?error=oauth_failed");
  });

  it("fails when code is missing or the exchange fails", async () => {
    expect((await run(intent(), {}, { code: null })).path).toBe("/ar/login?error=oauth_failed");
    expect((await run(intent(), { exchangeError: new Error("x") })).path).toBe("/ar/login?error=oauth_failed");
  });

  it("returns errors to the invite page for invite intents", async () => {
    const r = await run(intent({ intent: "client_invite", inviteToken: TOKEN }), {}, { providerError: "access_denied" });
    expect(r.path).toBe(`/ar/join/${TOKEN}?error=oauth_cancelled`);
    const t = await run(intent({ intent: "team_invite", inviteToken: TOKEN, locale: "en" }), {}, { providerError: "x" });
    expect(t.path).toBe(`/en/join-team/${TOKEN}?error=oauth_failed`);
  });

  it("falls back to a login intent when the cookie is missing", async () => {
    const r = await run(null, { user: oldUser, profile: doneProfile });
    expect(r.path).toBe("/ar/dashboard");
  });

  it("fails when the user or profile can't be loaded", async () => {
    expect((await run(intent(), { user: null })).path).toBe("/ar/login?error=oauth_failed");
    expect((await run(intent(), { profile: null })).path).toBe("/ar/login?error=oauth_failed");
  });
});

describe("login intent", () => {
  it("deletes a brand-new Google user and sends them to sign up", async () => {
    const r = await run(intent());
    expect(r.path).toBe("/ar/login?error=no_account");
    expect(r.calls).toEqual(["delete:u1", "signOut"]);
  });

  it("never deletes an existing account", async () => {
    const r = await run(intent(), { user: oldUser, profile: doneProfile });
    expect(r.calls).toEqual([]);
    expect(r.path).toBe("/ar/dashboard");
  });

  it("redirects by role like email login", async () => {
    const at = (role: string) => run(intent({ locale: "en" }), { user: oldUser, profile: { ...doneProfile, role } });
    expect((await at("admin")).path).toBe("/en/admin");
    expect((await at("client")).path).toBe("/en/c");
    expect((await at("coach")).path).toBe("/en/dashboard");
  });

  it("sends suspended users to /suspended", async () => {
    const r = await run(intent(), { user: oldUser, profile: { ...doneProfile, suspended_at: "2026-11-01" } });
    expect(r.path).toBe("/ar/suspended");
  });

  it("honours a safe next and ignores an unsafe one", async () => {
    const ok = await run(intent({ next: "/ar/settings" }), { user: oldUser, profile: doneProfile });
    expect(ok.path).toBe("/ar/settings");
    const bad = await run(intent({ next: "//evil.com" }), { user: oldUser, profile: doneProfile });
    expect(bad.path).toBe("/ar/dashboard");
  });
});

describe("cleanup guards", () => {
  it("refuses to delete a user with a second identity (linked to an email account)", async () => {
    const linked: OAuthUser = { ...freshUser, identities: [{ provider: "email" }, { provider: "google" }] };
    const r = await run(intent(), { user: linked });
    expect(r.calls).not.toContain("delete:u1");
  });

  it("refuses to delete an admin", async () => {
    const r = await run(intent(), { profile: { ...freshProfile, role: "admin" } });
    expect(r.calls).not.toContain("delete:u1");
  });

  it("does not treat a fresh account that already accepted terms as new", async () => {
    const r = await run(intent(), { profile: doneProfile });
    expect(r.calls).toEqual([]);
  });
});

describe("signup intent", () => {
  const signup = (over: Partial<OAuthIntent> = {}) => intent({ intent: "signup", terms: "2026-10-13", ...over });

  it("finalizes terms + locale for a new user and lands on the coach home", async () => {
    const r = await run(signup({ locale: "en" }));
    expect(r.calls).toEqual(["finalize"]);
    expect(r.finalizeArgs[0]).toEqual({ terms: "2026-10-13", locale: "en" });
    expect(r.path).toBe("/en/dashboard");
  });

  it("rejects + cleans up when signups are closed", async () => {
    const r = await run(signup(), { signups: false });
    expect(r.path).toBe("/ar/signup?error=signups_closed");
    expect(r.calls).toEqual(["delete:u1", "signOut"]);
  });

  it("cleans up when terms are missing (never skip consent)", async () => {
    const r = await run(signup({ terms: undefined }));
    expect(r.path).toBe("/ar/signup?error=oauth_failed");
    expect(r.calls).toEqual(["delete:u1", "signOut"]);
  });

  it("cleans up when finalize fails", async () => {
    const r = await run(signup(), { finalizeError: new Error("x") });
    expect(r.path).toBe("/ar/signup?error=oauth_failed");
    expect(r.calls).toEqual(["finalize", "delete:u1", "signOut"]);
  });

  it("an existing account signing up via Google is just signed in (no duplicate, no finalize)", async () => {
    const r = await run(signup(), { user: oldUser, profile: doneProfile });
    expect(r.calls).toEqual([]);
    expect(r.path).toBe("/ar/dashboard");
  });
});

describe("client invite intent", () => {
  const invite = (over: Partial<OAuthIntent> = {}) =>
    intent({ intent: "client_invite", inviteToken: TOKEN, terms: "2026-10-13", next: "/ar/c", ...over });

  it("links the invite and lands on the client home", async () => {
    const r = await run(invite());
    expect(r.finalizeArgs[0]).toEqual({ terms: "2026-10-13", locale: "ar", inviteToken: TOKEN });
    expect(r.path).toBe("/ar/c");
  });

  it("goes to /c even with no next", async () => {
    expect((await run(invite({ next: undefined }))).path).toBe("/ar/c");
  });

  it("cleans up and reports invalid_invite when the invite is rejected", async () => {
    const r = await run(invite(), { finalizeError: new Error("used") });
    expect(r.path).toBe(`/ar/join/${TOKEN}?error=invalid_invite`);
    expect(r.calls).toEqual(["finalize", "delete:u1", "signOut"]);
  });
});

describe("team invite intent", () => {
  const team = (over: Partial<OAuthIntent> = {}) =>
    intent({ intent: "team_invite", inviteToken: TOKEN, terms: "2026-10-13", next: `/ar/join-team/${TOKEN}`, ...over });

  it("finalizes, accepts the invite, and goes to the coach home (not back to the invite page)", async () => {
    const r = await run(team());
    expect(r.calls).toEqual(["finalize", "acceptTeam"]);
    expect(r.path).toBe("/ar/dashboard");
  });

  it.each([
    ["team_limit_reached", "team_full"],
    ["email_mismatch", "team_wrong_email"],
    ["owns_business", "team_owns_business"],
    ["whatever", "invalid_invite"],
  ])("maps hint %s to %s and cleans up", async (hint, key) => {
    const r = await run(team(), { teamError: { hint } });
    expect(r.path).toBe(`/ar/join-team/${TOKEN}?error=${key}`);
    expect(r.calls).toEqual(["finalize", "acceptTeam", "delete:u1", "signOut"]);
  });

  it("an existing coach just returns to the invite page to accept as themselves", async () => {
    const r = await run(team(), { user: oldUser, profile: doneProfile });
    expect(r.calls).toEqual([]);
    expect(r.path).toBe(`/ar/join-team/${TOKEN}`);
  });
});

describe("oauthIntentSchema (cookie)", () => {
  it("accepts a valid cookie and rejects garbage / tampering", () => {
    expect(oauthIntentSchema.safeParse({ intent: "login", locale: "ar" }).success).toBe(true);
    expect(oauthIntentSchema.safeParse({ intent: "admin", locale: "ar" }).success).toBe(false);
    expect(oauthIntentSchema.safeParse({ intent: "login", locale: "fr" }).success).toBe(false);
    expect(oauthIntentSchema.safeParse({ intent: "signup", locale: "ar", terms: "latest" }).success).toBe(false);
  });
});
