// Fails if a tracked file contains one of the names kept out of the public
// repository. The names come from apps/web/.env.local, which git ignores: every
// NEXT_PUBLIC_ value except the product, plus PRIVATE_TERMS, separated by "|".
// With no .env.local there is nothing to check. Runs in `pnpm check` and in the
// pre-commit hook (`git config core.hooksPath .githooks` once per clone).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = resolve(ROOT, "apps/web/.env.local");

if (!existsSync(ENV)) {
  console.log("no apps/web/.env.local, nothing to check");
  process.exit(0);
}
process.loadEnvFile(ENV);
const terms = [
  process.env.NEXT_PUBLIC_FIELD,
  process.env.NEXT_PUBLIC_PS,
  process.env.NEXT_PUBLIC_EVENT,
  ...(process.env.PRIVATE_TERMS ?? "").split("|"),
]
  .map((t) => t?.trim().toLowerCase())
  .filter((t): t is string => !!t);

// Staged content in the hook, the working tree otherwise.
const staged = process.argv.includes("--staged");
const files = execFileSync("git", ["ls-files", ...(staged ? ["--cached"] : [])], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !/\.(png|gif|jpe?g|woff2?|parquet|mp4)$/.test(f));

const hits: string[] = [];
for (const f of files) {
  const text = staged
    ? execFileSync("git", ["show", `:${f}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 })
    : existsSync(resolve(ROOT, f))
      ? readFileSync(resolve(ROOT, f), "utf8")
      : "";
  const lower = text.toLowerCase();
  for (const t of terms) if (lower.includes(t) || f.toLowerCase().includes(t)) hits.push(`${f}: "${t}"`);
}
if (hits.length) {
  console.error(`private names in tracked files:\n  ${hits.join("\n  ")}`);
  process.exit(1);
}
console.log(`no private names in ${files.length} tracked files`);
