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
    include: ["packages/*/test/**/*.test.ts", "apps/web/src/**/*.test.{ts,tsx}"],
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
      // the model and the app's logic. The three.js scenes and most screens
      // are drawing code, checked by the recorded takes rather than here.
      thresholds: {
        lines: 45,
        statements: 45,
        functions: 40,
        branches: 35,
        "packages/*/src/**": { lines: 95, statements: 95, functions: 95, branches: 90 },
        "apps/web/src/**/*.ts": { lines: 70, statements: 70, functions: 65, branches: 60 },
      },
    },
  },
});
