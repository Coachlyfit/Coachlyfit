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
]);

export default eslintConfig;
