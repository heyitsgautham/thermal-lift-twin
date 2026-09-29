import { floatFreeSpm, ROD_STRING } from "./rod-string";
import { apiToSpecificGravity } from "./units";
import { viscosity_cP, type WaltherCurve } from "./viscosity";

// One function owns the coupled well state for a production day:
// heated-zone temperature -> oil viscosity -> inflow -> pump limit -> oil rate.
// Every screen reads rates from here, so temperature, viscosity, inflow and pump
// numbers can never disagree with each other.

export interface ReservoirFluid {
  reservoirTemperature_C: number;
  api_deg: number;
  viscosity: WaltherCurve;
}

export interface PumpSpec {
  stroke_in: number;
  plungerDiameter_in: number;
  fillage_frac: number;
}

export interface CssWellProperties {
  /** Oil rate the well made cold, before its first steam cycle. */
  coldOilRate_bbl_per_d: number;
  /** Exponent on the viscosity ratio. Stands for the share of drawdown taken in the heated zone. */
  heatedZoneExponent: number;
  baseWaterCut_frac: number;
  pump: PumpSpec;
}

export interface SteamCycleSpec {
  cycleNumber: number;
  steam_t: number;
  injectionTemperature_C: number;
  /** Soak days. Between 5 and 7 the steam has condensed and nothing changes; see `soakFactors`. */
  soak_d?: number;
}

/** Model constants. Each is an assumption, listed on the model page. */
export const MODEL = {
  /** Share of the injection temperature rise left in the heated zone when production starts, cycle 1. */
  heatRetentionCycle1_frac: 0.58,
  /** Heat retention multiplier per later cycle. */
  heatRetentionPerCycle: 0.94,
  /** Cooling time constant for a reference cycle (Boberg-Lantz lumped decay). */
  coolingTau_d: 60,
  referenceSteam_t: 2400,
  /**
   * Above this slug size a growing share of the extra heat goes into the cap
   * and base rock rather than the oil zone. Every cycle in the field data sits
   * below it; the what-if lab can go above it.
   */
  largeSlug_t: 2800,
  /** Tonnes over `largeSlug_t` for heat retention to fall by a factor e. */
  largeSlugLoss_t: 9000,
  /** Soak window in which the steam has condensed and little heat has been lost. */
  soakPlateau_d: [5, 7] as const,
  /** Heat retention and cooling time lost per day of soak short of the plateau. */
  shortSoakPenaltyPerDay: 0.06,
  /** Days for heat retention to fall by a factor e once soak runs past the plateau. */
  longSoakLoss_d: 25,
  /** Near-well oil saturation left per later cycle. */
  saturationPerCycle: 0.93,
  /** Water cut right after soak, from condensed steam flowing back. */
  initialWaterCut_frac: 0.8,
  waterCutCleanup_d: 10,
  /** API RP 11L pump displacement constant, bbl/d per (in * SPM * in^2). */
  pumpConstant: 0.1166,
} as const;

export interface WellDayState {
  /** Heated-zone (bottomhole) temperature. */
  temperature_C: number;
  wellheadTemperature_C: number;
  /** Bottomhole viscosity, which sets inflow. */
  viscosity_cP: number;
  /** Viscosity at the tubing's mean temperature, which sets rod drag. */
  tubingViscosity_cP: number;
  spm: number;
  pumpCapacityLiquid_bbl_per_d: number;
  inflowOil_bbl_per_d: number;
  waterCut_frac: number;
  oil_bbl_per_d: number;
  liquid_bbl_per_d: number;
  limitedBy: "inflow" | "pump";
}

/**
 * Soak effects. Too short and uncondensed steam flashes back up the well, so
 * less heat stays and the heated zone is smaller. Too long and heat conducts
 * away into the cap and base rock.
 */
export function soakFactors(soak_d: number): { retention: number; tau: number } {
  const [lo, hi] = MODEL.soakPlateau_d;
  if (soak_d < lo) {
    const short = 1 - MODEL.shortSoakPenaltyPerDay * (lo - soak_d);
    return { retention: short, tau: short };
  }
  if (soak_d > hi) return { retention: Math.exp(-(soak_d - hi) / MODEL.longSoakLoss_d), tau: 1 };
  return { retention: 1, tau: 1 };
}

export function heatedZoneStartTemperature_C(fluid: ReservoirFluid, cycle: SteamCycleSpec): number {
  const retention =
    MODEL.heatRetentionCycle1_frac *
    Math.pow(MODEL.heatRetentionPerCycle, cycle.cycleNumber - 1) *
    soakFactors(cycle.soak_d ?? 6).retention *
    Math.exp(-Math.max(0, cycle.steam_t - MODEL.largeSlug_t) / MODEL.largeSlugLoss_t);
  return (
    fluid.reservoirTemperature_C +
    (cycle.injectionTemperature_C - fluid.reservoirTemperature_C) * retention
  );
}

/** Heated volume grows with injected steam, so the lumped cooling time grows with it. */
export function coolingTau_d(cycle: SteamCycleSpec): number {
  return MODEL.coolingTau_d * (cycle.steam_t / MODEL.referenceSteam_t) * soakFactors(cycle.soak_d ?? 6).tau;
}

export function heatedZoneTemperature_C(
  fluid: ReservoirFluid,
  cycle: SteamCycleSpec,
  daysSinceSoakEnd: number,
): number {
  const start_C = heatedZoneStartTemperature_C(fluid, cycle);
  return (
    fluid.reservoirTemperature_C +
    (start_C - fluid.reservoirTemperature_C) * Math.exp(-daysSinceSoakEnd / coolingTau_d(cycle))
  );
}

/**
 * Produced fluid cools on its way up the tubing. The wellhead sits a fixed share
 * of the way from ground temperature to bottomhole temperature, and rod drag
 * uses the tubing's mean temperature.
 */
export const WELLBORE = {
  groundTemperature_C: 30,
  wellheadShare: 0.55,
} as const;

export function wellheadTemperature_C(bottomhole_C: number): number {
  return WELLBORE.groundTemperature_C + WELLBORE.wellheadShare * (bottomhole_C - WELLBORE.groundTemperature_C);
}

export function tubingViscosity_cP(fluid: ReservoirFluid, bottomhole_C: number): number {
  return viscosity_cP(fluid.viscosity, (bottomhole_C + wellheadTemperature_C(bottomhole_C)) / 2);
}

/** Fluid density used for buoyancy and fluid load, from API gravity at 60 °F. */
export function fluidDensity_kg_per_m3(fluid: ReservoirFluid): number {
  return apiToSpecificGravity(fluid.api_deg) * 1000;
}

/**
 * Fastest the unit may run at constant speed without floating the rods, held
 * between the unit's minimum and maximum SPM. At the minimum the rods can still
 * float in cold crude, which is what the slow-downstroke profile is for.
 */
export function rodFloatSpmLimit(viscosity_cP: number, stroke_in: number, fluidDensity: number): number {
  const spm = floatFreeSpm(viscosity_cP, fluidDensity, stroke_in, 0.5);
  return Math.min(ROD_STRING.maxSpm, Math.max(ROD_STRING.minSpm, spm));
}

export function pumpDisplacement_bbl_per_d(pump: PumpSpec, spm: number): number {
  return (
    MODEL.pumpConstant * pump.stroke_in * spm * pump.plungerDiameter_in ** 2 * pump.fillage_frac
  );
}

function pumpLimitedState(
  fluid: ReservoirFluid,
  pump: PumpSpec,
  temperature_C: number,
  viscosity: number,
  inflowOil_bbl_per_d: number,
  waterCut_frac: number,
): WellDayState {
  const tubing_cP = tubingViscosity_cP(fluid, temperature_C);
  const spm = rodFloatSpmLimit(tubing_cP, pump.stroke_in, fluidDensity_kg_per_m3(fluid));
  const pumpCapacityLiquid_bbl_per_d = pumpDisplacement_bbl_per_d(pump, spm);
  const pumpOil_bbl_per_d = pumpCapacityLiquid_bbl_per_d * (1 - waterCut_frac);
  const limitedBy = pumpOil_bbl_per_d < inflowOil_bbl_per_d ? "pump" : "inflow";
  const oil_bbl_per_d = Math.min(inflowOil_bbl_per_d, pumpOil_bbl_per_d);
  return {
    temperature_C,
    wellheadTemperature_C: wellheadTemperature_C(temperature_C),
    viscosity_cP: viscosity,
    tubingViscosity_cP: tubing_cP,
    spm,
    pumpCapacityLiquid_bbl_per_d,
    inflowOil_bbl_per_d,
    waterCut_frac,
    oil_bbl_per_d,
    liquid_bbl_per_d: oil_bbl_per_d / (1 - waterCut_frac),
    limitedBy,
  };
}

/** State of a CSS well on a given day of its production leg (day 0 = first day after soak). */
export function cssProductionState(
  fluid: ReservoirFluid,
  well: CssWellProperties,
  cycle: SteamCycleSpec,
  daysSinceSoakEnd: number,
): WellDayState {
  const temperature_C = heatedZoneTemperature_C(fluid, cycle, daysSinceSoakEnd);
  const hot_cP = viscosity_cP(fluid.viscosity, temperature_C);
  const cold_cP = viscosity_cP(fluid.viscosity, fluid.reservoirTemperature_C);
  const saturation = Math.pow(MODEL.saturationPerCycle, cycle.cycleNumber - 1);
  const inflowOil_bbl_per_d =
    well.coldOilRate_bbl_per_d * Math.pow(cold_cP / hot_cP, well.heatedZoneExponent) * saturation;
  const waterCut_frac =
    well.baseWaterCut_frac +
    (MODEL.initialWaterCut_frac - well.baseWaterCut_frac) *
      Math.exp(-daysSinceSoakEnd / MODEL.waterCutCleanup_d);
  return pumpLimitedState(fluid, well.pump, temperature_C, hot_cP, inflowOil_bbl_per_d, waterCut_frac);
}

export interface ColdWellProperties {
  oilRateAtAsOf_bbl_per_d: number;
  decline_per_yr: number;
  waterCut_frac: number;
  pump: PumpSpec;
}

/** A well on cold primary production. Rate follows exponential decline from the as-of date. */
export function coldProductionState(
  fluid: ReservoirFluid,
  well: ColdWellProperties,
  daysFromAsOf: number,
): WellDayState {
  const temperature_C = fluid.reservoirTemperature_C;
  const cold_cP = viscosity_cP(fluid.viscosity, temperature_C);
  const inflowOil_bbl_per_d =
    well.oilRateAtAsOf_bbl_per_d * Math.exp((-well.decline_per_yr * daysFromAsOf) / 365);
  return pumpLimitedState(fluid, well.pump, temperature_C, cold_cP, inflowOil_bbl_per_d, well.waterCut_frac);
}
