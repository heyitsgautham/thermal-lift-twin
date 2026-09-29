import { steamTonnesToCweBbl } from "@bgw/physics";
import { operatingPlan } from "./operating";
import { cumulativeHazard, dailyImpact, type ReliabilityAssumptions } from "./reliability";
import { MAX_RESTEAM_SEARCH_D, resteamPoint } from "./resteam";
import type { WellModel } from "./well-model";

// One steam cycle under changed inputs, for the what-if lab. Steam tonnes set
// the injection days at the well's design rate, soak days change heat
// retention (see soakFactors), and the steam cost moves the re-steam day.
// Reservoir, wellbore and pump are evaluated together, so oil, steam-oil
// ratio, energy per barrel and expected failures all move from one change.

/** Days of rod pounding before a crew slows a unit by hand, the middle of the range the history uses. */
export const CREW_REACTION_D = 14;

export interface ScenarioInput {
  steam_t: number;
  soak_d: number;
  steamCost_bbl_per_t: number;
  pump: "twin" | "practice";
}

export interface ScenarioResult {
  injection_d: number;
  productionLeg_d: number;
  cycleLength_d: number;
  cycleOil_bbl: number;
  sor: number;
  oilPerCycleDay_bbl: number;
  energy_kWh: number;
  kWhPerBbl: number;
  /** Expected failures over the cycle under the stated hazard, from rod-float loading plus the base rate. */
  expectedFailures: number;
  /** Chance of at least one rod or pump failure during the cycle, from the same hazard. */
  failureChance: number;
  /** True when the re-steam rule found no day inside its search limit: a new cycle does not pay. */
  noResteam: boolean;
  floatDays: number;
  oil: number[];
  temperature_C: number[];
}

export function cycleScenario(
  model: WellModel,
  cycleNumber: number,
  input: ScenarioInput,
  minProductionLeg_d: number,
  reliability: ReliabilityAssumptions,
): ScenarioResult {
  const css = model.well.css!;
  const design = css.design;
  // Whole injection days near the design rate, with the rate trimmed so the tonnes match exactly.
  const injection_d = Math.max(1, Math.round(input.steam_t / (design.injectionRate_t_per_h * 24)));
  const steam_t = input.steam_t;
  const spec = { cycleNumber, steam_t, injectionTemperature_C: design.injectionTemperature_C, soak_d: input.soak_d };
  const nextSteam = design.injectionRate_t_per_h * 24 * design.injection_d;
  const point = resteamPoint(
    model.cycleCurve(spec),
    { start_d: 0, injection_d, soak_d: input.soak_d },
    {
      curve: model.cycleCurve({ cycleNumber: cycleNumber + 1, steam_t: nextSteam, injectionTemperature_C: design.injectionTemperature_C, soak_d: design.soak_d }),
      injection_d: design.injection_d,
      soak_d: design.soak_d,
      steam_t: nextSteam,
    },
    input.steamCost_bbl_per_t,
    minProductionLeg_d,
  );
  const plan = operatingPlan(model.fluid, css, spec, point.productionLeg_d);
  let oil = 0;
  let energy = 0;
  let impact = 0;
  let floatDays = 0;
  for (const d of plan.days) {
    const setting = input.pump === "twin" ? d.twin : d.practice;
    oil += d.oil_bbl_per_d;
    energy += setting.energy_kWh;
    if (setting.floatRatio > reliability.impactFromRatio) {
      floatDays++;
      // Current practice: the crew slows the unit once the rods have pounded for a couple of weeks.
      if (input.pump === "twin" || floatDays <= CREW_REACTION_D) impact += dailyImpact(setting.floatRatio, reliability);
    }
  }
  const cycleLength = injection_d + input.soak_d + point.productionLeg_d;
  const expected = cumulativeHazard(impact, reliability) + (reliability.baseFailuresPerYear * cycleLength) / 365;
  return {
    injection_d,
    productionLeg_d: point.productionLeg_d,
    cycleLength_d: cycleLength,
    cycleOil_bbl: oil,
    sor: steamTonnesToCweBbl(steam_t) / oil,
    oilPerCycleDay_bbl: oil / cycleLength,
    energy_kWh: energy,
    kWhPerBbl: energy / oil,
    expectedFailures: expected,
    failureChance: 1 - Math.exp(-expected),
    noResteam: point.productionLeg_d >= MAX_RESTEAM_SEARCH_D,
    floatDays,
    oil: plan.days.map((d) => d.oil_bbl_per_d),
    temperature_C: plan.days.map((d) => d.temperature_C),
  };
}
