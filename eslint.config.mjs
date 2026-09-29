import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// One config for the whole workspace: Next's rules for the web app, the same
// TypeScript rules for the packages and the recording scripts.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { settings: { next: { rootDir: "apps/web/" } } },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/node_modules/**",
    "**/next-env.d.ts",
    "apps/api/**",
    "data/**",
    "recording/out/**",
    "coverage/**",
  ]),
]);
