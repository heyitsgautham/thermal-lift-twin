import type { ColdWellProperties, CssWellProperties } from "@bgw/physics";
import type { ReliabilityAssumptions } from "./reliability";

// The field model the scheduler works on. `@bgw/simulate` produces it,
// `data/demo/field.json` stores it, and the web app reads it.
// Days are integers relative to the as-of date: day 0 is the as-of date.

export type WellStatus = "css" | "cold" | "shut-in" | "observation";

export interface WellFluid {
  reservoirTemperature_C: number;
  api_deg: number;
  viscosityAt50C_cP: number;
}

export interface CssDesign {
  injectionRate_t_per_h: number;
  injection_d: number;
  soak_d: number;
  injectionTemperature_C: number;
}

/** Schematic position inside the field outline. OIL does not publish well coordinates. */
export interface WellLocation {
  x_km: number;
  y_km: number;
}

export interface WellRecord {
  id: string;
  number: number;
  status: WellStatus;
  location: WellLocation;
  completion: "vertical" | "deviated" | "fishbone";
  spudYear: number;
  fluid: WellFluid;
  /** Present when status is "css". */
  css?: CssWellProperties & { design: CssDesign; cssStartYear: number };
  /** Present when status is "cold". */
  cold?: ColdWellProperties;
}

export interface CycleRecord {
  wellId: string;
  cycleNumber: number;
  steamStart_d: number;
  injection_d: number;
  soak_d: number;
  rate_t_per_h: number;
  injectionTemperature_C: number;
  note?: string;
}

/** A planned steam cycle. Moving a slot moves its injection and soak together. */
export interface SteamSlot {
  id: string;
  wellId: string;
  cycleNumber: number;
  start_d: number;
  injection_d: number;
  soak_d: number;
  rate_t_per_h: number;
  injectionTemperature_C: number;
}

export interface DowntimeEvent {
  wellId: string;
  start_d: number;
  duration_d: number;
  reason: string;
}

export interface Assumptions {
  generatorUnits: number;
  generatorUnitCapacity_t_per_h: number;
  /** Oil-equivalent cost of one tonne of steam. Sets the re-steam day. */
  steamCost_bbl_per_t: number;
  /** Shortest production leg before a well can be steamed again. */
  minProductionLeg_d: number;
  viscosityHighAnchor: { temperature_C: number; viscosity_cP: number };
  reliability: ReliabilityAssumptions;
}

export type FailureType = "rod parted" | "pump unseated" | "tubing leak";

/** A failure in the synthetic history. Days are relative to the as-of date, so all are negative. */
export interface FailureRecord {
  wellId: string;
  day_d: number;
  type: FailureType;
  /** Days of rising card-shape drift before the failure. */
  precursor_d: number;
  downtime_d: number;
}

/** Health inputs the reliability screen needs, as of day 0. */
export interface WellHealth {
  wellId: string;
  /** Card-shape drift for the last 60 days, oldest first. 0 is the well's own baseline card. */
  drift60: number[];
  /** Cumulative impact loading since the last rod job. */
  impact: number;
  failures: number;
  lastFailure_d: number | null;
}

/** Logged against modelled daily oil for one well, for the calibration plot. */
export interface CalibrationSeries {
  wellId: string;
  from_d: number;
  logged: (number | null)[];
  model: number[];
}

export interface HistoryMeta {
  from: string;
  to: string;
  dailyRows: number;
  columns: string[];
  failures: number;
  missingFraction: number;
  frozenRuns: number;
  file: string;
}

/** Top of the Jodhpur Sandstone on a regular grid, metres below ground. Schematic. */
export interface StructureGrid {
  nx: number;
  ny: number;
  x0_km: number;
  y0_km: number;
  step_km: number;
  depth_m: number[];
}

export interface FieldDataset {
  meta: {
    seed: number;
    asOf: string;
    horizon_d: number;
    generatorVersion: string;
  };
  field: {
    name: string;
    wellsDrilled: number;
    wellsProducing: number;
    wellsOnCss: number;
  };
  assumptions: Assumptions;
  wells: WellRecord[];
  cycles: CycleRecord[];
  issuedPlan: SteamSlot[];
  downtime: DowntimeEvent[];
  failures: FailureRecord[];
  health: WellHealth[];
  calibration: CalibrationSeries[];
  history: HistoryMeta;
  map: { outline_km: [number, number][]; structure: StructureGrid };
}

export interface Capacity {
  units: number;
  unitCapacity_t_per_h: number;
}

export function totalCapacity_t_per_h(capacity: Capacity): number {
  return capacity.units * capacity.unitCapacity_t_per_h;
}

export function slotSteam_t(slot: Pick<SteamSlot, "rate_t_per_h" | "injection_d">): number {
  return slot.rate_t_per_h * 24 * slot.injection_d;
}
