import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
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
