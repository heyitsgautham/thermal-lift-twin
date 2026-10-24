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
      include: ["packages/*/src/**/*.ts"],
      // Command-line entry points that only print or write files.
      exclude: ["packages/simulate/src/cli.ts", "packages/simulate/src/inspect.ts", "packages/simulate/src/tune.ts"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
