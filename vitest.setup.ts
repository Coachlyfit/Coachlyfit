import { afterEach } from "vitest";

// Only wired for jsdom-environment tests (which opt in via a per-file
// `// @vitest-environment jsdom` docblock, per vitest.config.mts's mixed
// node/jsdom suite). Node-environment tests have no `document`, so skip.
if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  await import("@testing-library/jest-dom/vitest");
  afterEach(() => {
    cleanup();
  });
}
