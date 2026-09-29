import type { CycleCurve, WellModel } from "./well-model";

// Re-steam day. Steam again on the first day this cycle's oil rate falls below
// what a fresh cycle would average, net of the steam it costs and counting the
// days the well sits shut in for injection and soak. From that day on, the next
// cycle out-earns the tail of this one. This is the marginal-value rule from
// optimal replacement, with steam priced in barrels of oil. The fresh cycle is
// the next cycle number, so it carries the usual cycle-on-cycle decline.

export interface CycleTiming {
  start_d: number;
  injection_d: number;
  soak_d: number;
}

export interface NextCycle {
  curve: CycleCurve;
  injection_d: number;
  soak_d: number;
  steam_t: number;
}

export interface ResteamPoint {
  /** Day index of the recommended next steam start. */
  day_d: number;
  /** Production days the cycle gets before that day. */
  productionLeg_d: number;
  oilRate_bbl_per_d: number;
  /** Best net average rate a fresh cycle can reach, the bar the tail is held to. */
  freshCycleNetAverage_bbl_per_d: number;
}

/** Longest production leg the rule searches. Reaching it means re-steaming never pays. */
export const MAX_RESTEAM_SEARCH_D = 400;
const MAX_LEG_D = MAX_RESTEAM_SEARCH_D;

export function freshCycleNetAverage(
  next: NextCycle,
  steamCost_bbl_per_t: number,
  minProductionLeg_d: number,
): number {
  const shutIn_d = next.injection_d + next.soak_d;
  const cost_bbl = next.steam_t * steamCost_bbl_per_t;
  let best = -Infinity;
  for (let leg = minProductionLeg_d; leg <= MAX_LEG_D; leg++) {
    const avg = (next.curve.cumulativeOil(leg - 1) - cost_bbl) / (shutIn_d + leg);
    if (avg > best) best = avg;
  }
  return best;
}

export function resteamPoint(
  current: CycleCurve,
  timing: CycleTiming,
  next: NextCycle,
  steamCost_bbl_per_t: number,
  minProductionLeg_d: number,
): ResteamPoint {
  const bar = freshCycleNetAverage(next, steamCost_bbl_per_t, minProductionLeg_d);
  let leg = minProductionLeg_d;
  while (leg < MAX_LEG_D && current.oil(leg) >= bar) leg++;
  return {
    day_d: timing.start_d + timing.injection_d + timing.soak_d + leg,
    productionLeg_d: leg,
    oilRate_bbl_per_d: current.oil(leg),
    freshCycleNetAverage_bbl_per_d: bar,
  };
}

/** Production leg of a cycle that got the well's design steam, by the same rule. */
export function designLeg_d(
  model: WellModel,
  cycleNumber: number,
  steamCost_bbl_per_t: number,
  minProductionLeg_d: number,
): number {
  const design = model.well.css!.design;
  const spec = (n: number) => ({
    cycleNumber: n,
    steam_t: design.injectionRate_t_per_h * 24 * design.injection_d,
    injectionTemperature_C: design.injectionTemperature_C,
    soak_d: design.soak_d,
  });
  return resteamPoint(
    model.cycleCurve(spec(cycleNumber)),
    { start_d: 0, injection_d: design.injection_d, soak_d: design.soak_d },
    {
      curve: model.cycleCurve(spec(cycleNumber + 1)),
      injection_d: design.injection_d,
      soak_d: design.soak_d,
      steam_t: spec(cycleNumber + 1).steam_t,
    },
    steamCost_bbl_per_t,
    minProductionLeg_d,
  ).productionLeg_d;
}
