import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    // The web app's own path aliases, from apps/web/tsconfig.json.
    alias: [
      { find: /^@\//, replacement: path("./apps/web/src/") },
      { find: /^@data\//, replacement: path("./data/") },
    ],
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/web/src/**/*.test.{ts,tsx}", "recording/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["packages/*/src/**/*.ts", "apps/web/src/**/*.{ts,tsx}"],
      exclude: [
        // Command-line entry points that only print or write files.
        "packages/simulate/src/cli.ts",
        "packages/simulate/src/inspect.ts",
        "packages/simulate/src/tune.ts",
        "**/__tests__/**",
      ],
      // A floor for everything, and stricter floors for the modules that hold
      // the model, the app's logic and the screens rendered in jsdom. The
      // three.js scenes need WebGL, so the recorded takes check them instead.
      thresholds: {
        lines: 68,
        statements: 68,
        functions: 65,
        branches: 62,
        "packages/*/src/**": { lines: 95, statements: 95, functions: 95, branches: 90 },
        "apps/web/src/**/*.ts": { lines: 80, statements: 78, functions: 75, branches: 78 },
        "apps/web/src/components/{screens,story,calendar}/**/*.tsx": { lines: 80, statements: 80, functions: 75, branches: 68 },
      },
    },
  },
});
