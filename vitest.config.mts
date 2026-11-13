import { defineConfig } from "vitest/config";
import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(import.meta.dirname, ".env.local") });
// tests/rls/** hit a real Supabase project over the network and create real
// auth users. .env.local points at the hosted project (needed for the app
// itself), so an optional .env.test.local — pointing at `supabase start`'s
// local stack — overrides the Supabase vars for test runs when present.
// Never committed; see .env.test.local.example.
config({ path: path.resolve(import.meta.dirname, ".env.test.local"), override: true });

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/domain/**/*.test.ts",
      "src/lib/**/*.test.ts",
      "src/content/**/*.test.ts",
      "src/components/**/*.test.tsx",
      "src/hooks/**/*.test.tsx",
      "tests/**/*.test.ts",
    ],
    testTimeout: 20_000,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
