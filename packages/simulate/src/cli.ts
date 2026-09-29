// Writes the seeded demo field. Same seed, same files. Run with `pnpm gen`.
//   data/demo/field.json     wells, cycles, plan, health, calibration, map
//   data/demo/daily.parquet  eight years of daily production and SRP telemetry
//   data/demo/tables.json    per-cycle oil curves the Python API schedules with
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parquetWriteBuffer } from "hyparquet-writer";
import { generateFieldWithHistory } from "./generate";
import { HISTORY_COLUMNS } from "./history";
import { scheduleTables } from "./tables";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const DEMO_DIR = resolve(ROOT, "data/demo");

const TYPES: Record<string, "STRING" | "INT32" | "DOUBLE"> = {
  date: "STRING",
  well_id: "STRING",
  phase: "STRING",
  day: "INT32",
  cycle: "INT32",
  failure: "INT32",
};

const { dataset, daily } = generateFieldWithHistory();
mkdirSync(DEMO_DIR, { recursive: true });
writeFileSync(resolve(DEMO_DIR, "field.json"), `${JSON.stringify(dataset)}\n`);
writeFileSync(resolve(DEMO_DIR, "tables.json"), `${JSON.stringify(scheduleTables(dataset))}\n`);
const buffer = parquetWriteBuffer({
  columnData: HISTORY_COLUMNS.map((name) => ({
    name,
    data: daily[name] as unknown[],
    type: TYPES[name] ?? "DOUBLE",
  })),
});
writeFileSync(resolve(DEMO_DIR, "daily.parquet"), Buffer.from(buffer));
console.log(
  `seed ${dataset.meta.seed}: ${dataset.wells.length} wells, ${dataset.cycles.length} cycles, ${dataset.issuedPlan.length} planned slots, ` +
    `${dataset.history.dailyRows} daily rows ${dataset.history.from} to ${dataset.history.to}, ${dataset.history.failures} failures`,
);
