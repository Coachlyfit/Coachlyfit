import { defineConfig } from "vitest/config";
import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(import.meta.dirname, ".env.local") });

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/domain/**/*.test.ts", "src/lib/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
