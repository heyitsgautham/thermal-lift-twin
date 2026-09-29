// Checks that data/demo/tables.json matches the committed file after `pnpm gen`.
// The file holds raw doubles, and their last digits differ between machines, so
// numbers are compared within one part in a billion, the tolerance the API
// tests hold these values to. Everything else must match exactly. CI runs it.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "data/demo/tables.json";
const REL = 1e-9;
const ABS = 1e-6;

const committed: unknown = JSON.parse(execFileSync("git", ["show", `HEAD:${FILE}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }));
const fresh: unknown = JSON.parse(readFileSync(resolve(ROOT, FILE), "utf8"));

const diffs: string[] = [];
function same(a: unknown, b: unknown, path: string): void {
  if (typeof a === "number" && typeof b === "number") {
    if (Math.abs(a - b) > Math.max(REL * Math.max(Math.abs(a), Math.abs(b)), ABS)) diffs.push(`${path}: ${a} against ${b}`);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) diffs.push(`${path}: ${a.length} items against ${b.length}`);
    else a.forEach((x, i) => same(x, b[i], `${path}[${i}]`));
  } else if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (!(k in x) || !(k in y)) diffs.push(`${path}/${k}: on one side only`);
      else same(x[k], y[k], `${path}/${k}`);
    }
  } else if (a !== b) {
    diffs.push(`${path}: ${JSON.stringify(a)} against ${JSON.stringify(b)}`);
  }
}

same(committed, fresh, "");
if (diffs.length) {
  console.error(`${FILE} is out of date, ${diffs.length} values differ:\n  ${diffs.slice(0, 20).join("\n  ")}`);
  process.exit(1);
}
console.log(`${FILE} matches within ${REL} relative`);
