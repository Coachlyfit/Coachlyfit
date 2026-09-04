import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import localRules from "./eslint-rules/no-physical-direction.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Supabase CLI's local runtime cache (vendored, not our code).
    "supabase/.temp/**",
    "supabase/.branches/**",
    // Generated types — reformat via `supabase gen types`, not by hand.
    "src/lib/supabase/database.types.ts",
  ]),
  {
    // RTL enforcement for app-authored code. components/ui/** is vendored
    // shadcn code we don't hand-edit, so it's excluded rather than patched.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**"],
    plugins: { local: localRules },
    rules: {
      "local/no-physical-direction": "error",
    },
  },
  {
    // Domain services stay framework-free: no next/react imports, so they
    // stay unit-testable with a mock DB client and have zero coupling to
    // the app layer.
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["next", "next/*"], message: "src/domain is framework-free: no Next.js imports." },
            { group: ["react", "react/*", "react-dom", "react-dom/*"], message: "src/domain is framework-free: no React imports." },
          ],
        },
      ],
    },
  },
  {
    // createAdminClient() bypasses RLS entirely. Every ID-taking server
    // action's safety today rests on "the caller's own RLS-scoped client
    // is what runs the query" — importing the admin client anywhere else
    // silently turns that into an IDOR. Only the cron route (trusted job,
    // no user session) and admin/actions.ts (documented: only for the two
    // Auth Admin API calls that have no RLS-respecting equivalent) may.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/supabase/admin.ts",
      "src/app/api/cron/**",
      "src/app/\\[locale\\]/\\(admin\\)/admin/actions.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              message:
                "createAdminClient() bypasses RLS and must not be used in a normal request path. " +
                "Only src/app/api/cron/** and admin/actions.ts (Auth Admin API calls) are allowed.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
