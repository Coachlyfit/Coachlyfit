import { z } from "zod";
import { roleHome } from "./role-home";
import { safeNext } from "./safe-next";

/** httpOnly cookie set by startGoogleAuthAction, read (and cleared) by
 * /auth/callback. signInWithOAuth can't carry signup metadata, so the intent
 * travels here instead — it also keeps invite tokens out of URLs. */
export const OAUTH_COOKIE = "oauth_intent";
export const OAUTH_COOKIE_MAX_AGE_S = 60 * 10;

export const oauthIntentSchema = z.object({
  intent: z.enum(["login", "signup", "client_invite", "team_invite"]),
  locale: z.enum(["ar", "en"]),
  next: z.string().max(2048).optional(),
  inviteToken: z.string().min(8).max(256).optional(),
  terms: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type OAuthIntent = z.infer<typeof oauthIntentSchema>;

export type OAuthUser = {
  id: string;
  created_at: string;
  identities?: { provider: string }[] | null;
};
export type OAuthProfile = {
  role: string | null;
  suspended_at: string | null;
  terms_accepted_at: string | null;
};

export type OAuthCallbackDeps = {
  exchangeCode(code: string): Promise<{ error: unknown }>;
  getUser(): Promise<OAuthUser | null>;
  getProfile(userId: string): Promise<OAuthProfile | null>;
  signupsEnabled(): Promise<boolean>;
  finalize(args: {
    terms: string;
    locale: string;
    inviteToken?: string;
  }): Promise<{ error: unknown }>;
  acceptTeamInvite(token: string): Promise<{ error: { hint?: string } | null }>;
  /** Auth Admin API delete. Only ever called through cleanupFreshUser's guards. */
  deleteUser(userId: string): Promise<{ error: unknown }>;
  signOut(): Promise<void>;
  now(): number;
};

export type OAuthCallbackInput = {
  code: string | null;
  /** `error` query param Supabase/Google appends when consent fails. */
  providerError: string | null;
  intent: OAuthIntent | null;
};

// A brand-new Google user is created moments before the callback runs. Anything
// older is an existing account (auto-linked or returning) and is never touched.
const FRESH_WINDOW_MS = 2 * 60 * 1000;

const TEAM_HINT_TO_ERROR: Record<string, string> = {
  team_limit_reached: "team_full",
  email_mismatch: "team_wrong_email",
  owns_business: "team_owns_business",
};

function errorPath(intent: OAuthIntent, key: string) {
  const { locale, inviteToken } = intent;
  let base = `/${locale}/login`;
  if (intent.intent === "signup") base = `/${locale}/signup`;
  else if (intent.intent === "client_invite" && inviteToken) base = `/${locale}/join/${inviteToken}`;
  else if (intent.intent === "team_invite" && inviteToken) base = `/${locale}/join-team/${inviteToken}`;
  return `${base}?error=${key}`;
}

function isJustCreatedGoogleUser(user: OAuthUser, now: number) {
  const identities = user.identities ?? [];
  return (
    now - new Date(user.created_at).getTime() < FRESH_WINDOW_MS &&
    identities.length === 1 &&
    identities[0].provider === "google"
  );
}

/** Returns the locale-prefixed path to redirect to. Never throws on expected
 * failures: every failure maps to a translated `?error=` key on the right page. */
export async function handleOAuthCallback(
  input: OAuthCallbackInput,
  deps: OAuthCallbackDeps
): Promise<string> {
  const intent: OAuthIntent = input.intent ?? { intent: "login", locale: "ar" };
  const fail = (key: string) => errorPath(intent, key);

  if (input.providerError) {
    // Google's "Cancel" on the consent screen comes back as access_denied.
    return fail(input.providerError === "access_denied" ? "oauth_cancelled" : "oauth_failed");
  }
  if (!input.code) return fail("oauth_failed");

  const { error: exchangeError } = await deps.exchangeCode(input.code);
  if (exchangeError) return fail("oauth_failed");

  const user = await deps.getUser();
  const profile = user ? await deps.getProfile(user.id) : null;
  if (!user || !profile) return fail("oauth_failed");

  const now = deps.now();
  const fresh = isJustCreatedGoogleUser(user, now) && profile.terms_accepted_at === null;

  // Removes the account handle_new_user() auto-created for a Google user who
  // shouldn't have one. Hard guards: just created, sole Google identity, never
  // an admin — an existing account can never be deleted through this path.
  const cleanupFreshUser = async (key: string) => {
    if (isJustCreatedGoogleUser(user, deps.now()) && profile.role !== "admin") {
      const { error } = await deps.deleteUser(user.id);
      if (error) console.error("[auth/callback] cleanup of new OAuth user failed", { error });
    }
    await deps.signOut();
    return fail(key);
  };

  if (fresh) {
    switch (intent.intent) {
      case "login":
        // No account yet: Google sign-in must not silently create one (no
        // consent, no signups_enabled check). Send them to sign up properly.
        return cleanupFreshUser("no_account");

      case "signup": {
        if (!(await deps.signupsEnabled())) return cleanupFreshUser("signups_closed");
        if (!intent.terms) return cleanupFreshUser("oauth_failed");
        const { error } = await deps.finalize({ terms: intent.terms, locale: intent.locale });
        if (error) return cleanupFreshUser("oauth_failed");
        break;
      }

      case "client_invite": {
        if (!intent.terms || !intent.inviteToken) return cleanupFreshUser("oauth_failed");
        const { error } = await deps.finalize({
          terms: intent.terms,
          locale: intent.locale,
          inviteToken: intent.inviteToken,
        });
        if (error) return cleanupFreshUser("invalid_invite");
        break;
      }

      case "team_invite": {
        if (!intent.terms || !intent.inviteToken) return cleanupFreshUser("oauth_failed");
        const finalized = await deps.finalize({ terms: intent.terms, locale: intent.locale });
        if (finalized.error) return cleanupFreshUser("oauth_failed");
        const { error } = await deps.acceptTeamInvite(intent.inviteToken);
        if (error) return cleanupFreshUser(TEAM_HINT_TO_ERROR[error.hint ?? ""] ?? "invalid_invite");
        break;
      }
    }
  }

  // Role/state gates run in the route-group layouts and RLS, same as email
  // login; only suspension is short-circuited here to skip a flash of the
  // destination (mirrors signInAction).
  if (profile.suspended_at) return `/${intent.locale}/suspended`;

  // A just-accepted invite is done: the invite page would only show "already
  // used", so go straight to the role home (client role is set by finalize).
  const joined = fresh && (intent.intent === "client_invite" || intent.intent === "team_invite");
  const role = fresh && intent.intent === "client_invite" ? "client" : (profile.role ?? undefined);
  return (joined ? null : safeNext(intent.next)) ?? roleHome(intent.locale, role);
}
