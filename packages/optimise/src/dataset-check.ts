import type { FieldDataset, WellStatus } from "./types";

// The app imports the seeded dataset as JSON, so TypeScript cannot vouch for
// its shape. checkDataset tests the facts the model and screens rely on, and
// fails with every broken one named, rather than leaving a stale or hand-edited
// field.json to surface later as an undefined deep inside a screen.

export class DatasetError extends Error {
  constructor(readonly problems: string[]) {
    super(`The field dataset is invalid: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? `; and ${problems.length - 5} more` : ""}`);
    this.name = "DatasetError";
  }
}

const STATUSES: readonly WellStatus[] = ["css", "cold", "shut-in", "observation"];
const ARRAYS = ["wells", "cycles", "issuedPlan", "downtime", "failures", "health", "calibration"] as const;
const OBJECTS = ["meta", "field", "assumptions", "history", "map"] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Returns the dataset typed, or throws a DatasetError listing every problem found. */
export function checkDataset(raw: unknown): FieldDataset {
  if (!isObject(raw)) throw new DatasetError(["not a JSON object"]);
  const problems: string[] = [];
  for (const key of OBJECTS) if (!isObject(raw[key])) problems.push(`${key} is missing`);
  for (const key of ARRAYS) if (!Array.isArray(raw[key])) problems.push(`${key} is not a list`);
  if (problems.length) throw new DatasetError(problems);
  const d = raw as unknown as FieldDataset;

  const { meta } = d;
  if (!Number.isInteger(meta.seed)) problems.push("meta.seed is not an integer");
  if (!isDate(meta.asOf)) problems.push(`meta.asOf "${String(meta.asOf)}" is not a YYYY-MM-DD date`);
  if (!Number.isInteger(meta.horizon_d) || meta.horizon_d <= 0) problems.push("meta.horizon_d is not a positive whole number of days");
  if (typeof meta.generatorVersion !== "string" || !meta.generatorVersion) problems.push("meta.generatorVersion is missing");

  const ids = new Set<string>();
  const statusOf = new Map<string, WellStatus>();
  for (const [i, w] of d.wells.entries()) {
    if (typeof w?.id !== "string") {
      problems.push(`wells[${i}] has no id`);
      continue;
    }
    if (ids.has(w.id)) problems.push(`well ${w.id} appears twice`);
    ids.add(w.id);
    if (!STATUSES.includes(w.status)) problems.push(`well ${w.id} has unknown status "${String(w.status)}"`);
    statusOf.set(w.id, w.status);
    if (w.status === "css" && !w.css) problems.push(`well ${w.id} is on cyclic steam but has no css block`);
    if (w.status === "cold" && !w.cold) problems.push(`well ${w.id} is cold but has no cold block`);
  }

  const count = (s: WellStatus) => d.wells.filter((w) => w?.status === s).length;
  if (d.field.wellsDrilled !== d.wells.length) problems.push(`field.wellsDrilled is ${d.field.wellsDrilled} but ${d.wells.length} wells are listed`);
  if (d.field.wellsOnCss !== count("css")) problems.push(`field.wellsOnCss is ${d.field.wellsOnCss} but ${count("css")} wells are on cyclic steam`);
  if (d.field.wellsProducing !== count("css") + count("cold")) {
    problems.push(`field.wellsProducing is ${d.field.wellsProducing} but ${count("css") + count("cold")} wells produce`);
  }

  const slotIds = new Set<string>();
  for (const s of d.issuedPlan) {
    if (slotIds.has(s.id)) problems.push(`slot ${s.id} is issued twice`);
    slotIds.add(s.id);
    if (statusOf.get(s.wellId) !== "css") problems.push(`slot ${s.id} is for ${s.wellId}, which is not a cyclic-steam well`);
  }
  for (const c of d.cycles) if (!ids.has(c.wellId)) problems.push(`cycle ${c.cycleNumber} names unknown well ${c.wellId}`);

  if (problems.length) throw new DatasetError(problems);
  return d;
}
